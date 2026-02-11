# app.py - EchoRank 后端服务主程序
"""
接收语音 -> AI情感分析 -> BLS签名 -> 返回结果
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import hashlib
import time
import secrets
import logging
import os
from dotenv import load_dotenv
from typing import Dict, Any, Optional
import numpy as np

# 导入自定义模块(优雅降级)
try:
    from analyzer import EmotionAnalyzer, SpeakerVerifier
    ANALYZER_AVAILABLE = True
except Exception as e:
    ANALYZER_AVAILABLE = False
    print(f"⚠️  Warning: AI components not available: {e}")

try:
    from bls_signer import BLSSigner, construct_message
    SIGNER_AVAILABLE = True
except Exception as e:
    SIGNER_AVAILABLE = False
    print(f"⚠️  Warning: BLSSigner not available: {e}")

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

# 创建 FastAPI 应用
app = FastAPI(
    title="EchoRank AI Backend",
    description="去中心化语音情感分析服务",
    version="1.0.0"
)

# 配置 CORS(允许前端访问)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量:存储初始化的组件
emotion_analyzer = None
speaker_verifier = None
bls_signer = None
bot_public_key = None


@app.get("/status")
async def status():
    return {"service": "EchoRank AI Backend", "ok": True}


@app.on_event("startup")
async def startup_event():
    """服务启动时初始化组件"""
    global emotion_analyzer, speaker_verifier, bls_signer, bot_public_key
    
    logger.info("="*60)
    logger.info("Starting EchoRank AI Backend Service...")
    logger.info("="*60)
    
    # 1. 初始化情感分析器与声纹识别器
    if ANALYZER_AVAILABLE:
        try:
            logger.info("Loading SenseVoice emotion analyzer...")
            emotion_analyzer = EmotionAnalyzer()
            logger.info("✅ Emotion analyzer loaded successfully")
            
            logger.info("Loading Speaker Verification model (CAM++)...")
            speaker_verifier = SpeakerVerifier()
            logger.info("✅ Speaker verifier loaded successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to load AI models: {e}")
            logger.warning("⚠️  Service will run in LIMITED mode (no AI analysis)")
    else:
        logger.warning("⚠️  Analyzer module not available - running in LIMITED mode")
    
    # 2. 初始化 BLS 签名器
    if SIGNER_AVAILABLE:
        try:
            logger.info("Initializing BLS signer...")
            
            # 从环境变量读取私钥(使用第一个验证者的密钥)
            validator_sk = os.getenv("VALIDATOR_1_SK")
            if not validator_sk:
                raise ValueError("VALIDATOR_1_SK not found in .env file")
            
            # 转换为十六进制格式
            sk_hex = hex(int(validator_sk))
            bls_signer = BLSSigner(sk_hex)
            
            # 获取公钥
            bot_public_key = bls_signer.pk.hex()
            logger.info(f"✅ BLS signer initialized")
            logger.info(f"   Public Key: {bot_public_key[:32]}...")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize BLS signer: {e}")
            logger.warning("⚠️  Crypto features will be disabled")
    else:
        logger.warning("⚠️  BLS signer module not available")
    
    logger.info("="*60)
    logger.info("🚀 Service started successfully!")
    if not emotion_analyzer or not bls_signer:
        logger.warning("⚠️  Running in LIMITED mode - some features disabled")
    logger.info("="*60)


@app.get("/")
async def root():
    """健康检查端点"""
    return {
        "service": "EchoRank AI Backend",
        "status": "running",
        "version": "1.0.0",
        "public_key": bot_public_key[:32] + "..." if bot_public_key else None
    }


@app.get("/health")
async def health_check():
    """详细健康检查"""
    return {
        "status": "healthy",
        "components": {
            "emotion_analyzer": emotion_analyzer is not None,
            "bls_signer": bls_signer is not None,
            "public_key_available": bot_public_key is not None
        },
        "timestamp": int(time.time())
    }


@app.post("/analyze")
async def analyze_audio(audio: UploadFile = File(...)):
    """
    接收语音文件,进行情感分析并返回签名结果
    
    请求:
        - audio: 音频文件(支持 wav, mp3, m4a, ogg 等格式)
    
    响应:
        {
            "success": true,
            "result": {
                "emotion": "HAPPY",
                "intensity": 0.85,
                "confidence": 0.92,
                "keywords": ["活动", "很棒"],
                "events": ["applause"],
                "transcript": "这次活动很棒!",
                "language": "zh"
            },
            "crypto": {
                "audio_hash": "abc123...",
                "result_hash": "def456...",
                "message_hash": "ghi789...",
                "signature": "jkl012...",
                "public_key": "mno345...",
                "timestamp": 1706600000,
                "nonce": "pqr678..."
            }
        }
    """
    try:
        logger.info(f"Received audio file: {audio.filename}")
        
        # 检查必需的组件是否可用
        if not emotion_analyzer:
            raise HTTPException(
                status_code=503, 
                detail="Emotion analyzer not available. Please check server logs."
            )
        
        if not bls_signer:
            raise HTTPException(
                status_code=503,
                detail="BLS signer not available. Please check .env configuration."
            )
        
        # 1. 读取音频数据
        audio_bytes = await audio.read()
        audio_size = len(audio_bytes)
        logger.info(f"Audio size: {audio_size} bytes")
        
        if audio_size == 0:
            raise HTTPException(status_code=400, detail="Empty audio file")
        
        # 2. 计算音频哈希 (audio_hash)
        audio_hash = hashlib.sha256(audio_bytes).hexdigest()
        logger.info(f"Audio hash: {audio_hash[:16]}...")
        
        # 3. AI 情感分析
        logger.info("Running emotion analysis...")
        analysis_result = emotion_analyzer.analyze(audio_bytes)
        logger.info(f"Analysis complete: {analysis_result['emotion']} ({analysis_result['intensity']:.2f})")
        
        # 4. 构建结构化结果 JSON
        result_json = {
            "emotion": analysis_result["emotion"],
            "intensity": float(analysis_result["intensity"]),
            "confidence": float(analysis_result["confidence"]),
            "keywords": analysis_result["keywords"],
            "events": analysis_result["events"],
            "transcript": analysis_result["raw_text"],
            "language": analysis_result["language"]
        }
        
        # 5. 计算结果哈希 (result_hash)
        import json
        result_json_str = json.dumps(result_json, sort_keys=True, ensure_ascii=False)
        result_hash = hashlib.sha256(result_json_str.encode('utf-8')).hexdigest()
        logger.info(f"Result hash: {result_hash[:16]}...")
        
        # 6. 生成时间戳和随机数
        timestamp = int(time.time())
        nonce = secrets.token_hex(16)
        
        # 7. 构造待签名消息
        # 消息格式: audio_hash || result_hash || public_key || timestamp || nonce
        message = construct_message(
            audio_hash=audio_hash,
            result_hash=result_hash,
            algo_version="SenseVoice-v1.0",
            timestamp=timestamp,
            nonce=nonce
        )
        message_hash = message.hex()
        logger.info(f"Message hash: {message_hash[:16]}...")
        
        # 8. BLS 签名
        logger.info("Signing message with BLS...")
        signature = bls_signer.sign_message(message)
        signature_hex = signature.hex()
        logger.info(f"Signature: {signature_hex[:16]}...")
        
        # 9. 验证签名(自检)
        is_valid = BLSSigner.verify_signature(bls_signer.pk, message, signature)
        if not is_valid:
            logger.error("❌ Signature verification failed!")
            raise HTTPException(status_code=500, detail="Signature verification failed")
        logger.info("✅ Signature verified successfully")
        
        # 10. 构造返回结果
        response = {
            "success": True,
            "result": result_json,
            "crypto": {
                "audio_hash": audio_hash,
                "result_hash": result_hash,
                "message_hash": message_hash,
                "signature": signature_hex,
                "public_key": bot_public_key,
                "timestamp": timestamp,
                "nonce": nonce,
                "algorithm": "BLS12-381",
                "verified": is_valid
            },
            "metadata": {
                "audio_size": audio_size,
                "processing_time_ms": 0,  # 可以在开始时记录时间来计算
                "model_version": "SenseVoice-Small"
            }
        }
        
        logger.info("✅ Request processed successfully")
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/voiceprint")
async def extract_voiceprint(audio: UploadFile = File(...)):
    """
    提取音频的声纹特征向量 (Speaker Embedding)
    """
    try:
        if not speaker_verifier:
            raise HTTPException(status_code=503, detail="Speaker verifier not available")
            
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Empty audio file")
            
        embedding = speaker_verifier.get_embedding(audio_bytes)
        
        if embedding is None:
            raise HTTPException(status_code=500, detail="Voiceprint extraction failed")
            
        return {
            "success": True,
            "embedding": embedding.tolist(),
            "dimensions": len(embedding)
        }
    except Exception as e:
        logger.error(f"Voiceprint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compare_voiceprints")
async def compare_voiceprints(data: Dict[str, Any]):
    """
    比较两个声纹特征向量的相似度
    """
    try:
        if not speaker_verifier:
            raise HTTPException(status_code=503, detail="Speaker verifier not available")
            
        emb1 = data.get("embedding1")
        emb2 = data.get("embedding2")
        
        if not emb1 or not emb2:
            raise HTTPException(status_code=400, detail="Missing embeddings (embedding1 and embedding2)")
            
        # analyzer.py handles list -> array conversion
        similarity = speaker_verifier.calculate_similarity(emb1, emb2)
        
        return {
            "success": True,
            "similarity": similarity,
            "matched": similarity > 0.60 # 阈值从 0.85 降低到 0.60，更符合实际场景
        }
    except Exception as e:
        logger.error(f"Comparison error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/verify")
async def verify_signature(
    audio_hash: str,
    result_hash: str,
    timestamp: int,
    nonce: str,
    signature: str,
    public_key: str
):
    """
    验证签名的独立端点(可选功能)
    
    参数:
        - audio_hash: 音频哈希
        - result_hash: 结果哈希
        - timestamp: 时间戳
        - nonce: 随机数
        - signature: 签名(十六进制)
        - public_key: 公钥(十六进制)
    
    返回:
        {"valid": true/false}
    """
    try:
        # 重构消息
        message = construct_message(
            audio_hash=audio_hash,
            result_hash=result_hash,
            algo_version="SenseVoice-v1.0",
            timestamp=timestamp,
            nonce=nonce
        )
        
        # 转换签名和公钥
        signature_bytes = bytes.fromhex(signature)
        public_key_bytes = bytes.fromhex(public_key)
        
        # 验证
        is_valid = BLSSigner.verify_signature(
            public_key_bytes,
            message,
            signature_bytes
        )
        
        return {"valid": is_valid}
        
    except Exception as e:
        logger.error(f"Verification error: {e}")
        return {"valid": False, "error": str(e)}


@app.get("/public-key")
async def get_public_key():
    """获取服务的公钥"""
    if not bot_public_key:
        raise HTTPException(status_code=500, detail="Public key not initialized")
    
    return {
        "public_key": bot_public_key,
        "algorithm": "BLS12-381",
        "curve": "G2ProofOfPossession"
    }


if __name__ == "__main__":
    # 运行服务
    uvicorn.run(
        app,
        host="0.0.0.0",  # 监听所有网络接口
        port=8001,       # 端口号
        log_level="info"
    )

    