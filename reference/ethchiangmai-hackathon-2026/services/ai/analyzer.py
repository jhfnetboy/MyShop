# analyzer.py - SenseVoice 情感分析器
"""
使用 SenseVoice-Small 模型分析语音情感
"""

import io
import re
import os
import io
import torch
import torchaudio
import numpy as np
from typing import Dict, Tuple, List, Any
from funasr import AutoModel
import logging
import torch.nn.functional as F
try:
    import jieba
    import jieba.analyse
except ImportError:
    jieba = None

logger = logging.getLogger(__name__)


class SpeakerVerifier:
    """声纹识别器"""
    
    def __init__(self, model_path="damo/speech_campplus_sv_zh-cn_16k-common"):
        """初始化声纹模型"""
        logger.info(f"Loading Speaker Verification model from: {model_path}")
        self.model = AutoModel(
            model=model_path,
            trust_remote_code=True,
            disable_update=True
        )
        logger.info("Speaker Verification model loaded successfully")

    def get_embedding(self, audio_bytes: bytes) -> np.ndarray:
        """从音频中提取声纹特征向量"""
        # 预处理音频 (借用 EmotionAnalyzer 的逻辑)
        analyzer_temp = EmotionAnalyzer(load_model=False)
        audio_array, _ = analyzer_temp._preprocess_audio(audio_bytes)
        
        # 运行推理
        result = self.model.generate(input=audio_array)
        
        # 返回 Embedding (通常是一个 1D-vector)
        # 结果结构取决于具体模型，campp 通常在 'spk_embedding' 字段
        if isinstance(result, list) and len(result) > 0:
            return result[0]["spk_embedding"]
        return None

    @staticmethod
    def calculate_similarity(emb1: Any, emb2: Any) -> float:
        """计算两个声纹向量的余弦相似度"""
        if emb1 is None or emb2 is None:
            return 0.0
            
        # Ensure inputs are numpy arrays
        if isinstance(emb1, list):
            emb1 = np.array(emb1)
        if isinstance(emb2, list):
            emb2 = np.array(emb2)
            
        if not isinstance(emb1, np.ndarray) or not isinstance(emb2, np.ndarray):
            print(f"DEBUG: Invalid types for similarity: {type(emb1)} {type(emb2)}")
            return 0.0

        # Flatten to ensure (D,) shape instead of (1, D)
        emb1 = emb1.flatten()
        emb2 = emb2.flatten()

        t1 = torch.from_numpy(emb1).float()
        t2 = torch.from_numpy(emb2).float()
        
        # Cosine Similarity
        similarity = F.cosine_similarity(t1.unsqueeze(0), t2.unsqueeze(0))
        return float(similarity.item())


class EmotionAnalyzer:
    """语音情感分析器"""
    
    # 情感标签映射
    EMO_DICT = {
        "<|HAPPY|>": "HAPPY",
        "<|SAD|>": "SAD",
        "<|ANGRY|>": "ANGRY",
        "<|NEUTRAL|>": "NEUTRAL",
        "<|FEARFUL|>": "FEARFUL",
        "<|DISGUSTED|>": "DISGUSTED",
        "<|SURPRISED|>": "SURPRISED",
    }
    
    # 音频事件映射
    EVENT_DICT = {
        "<|BGM|>": "music",
        "<|Speech|>": "speech",
        "<|Applause|>": "applause",
        "<|Laughter|>": "laughter",
        "<|Cry|>": "cry",
        "<|Sneeze|>": "sneeze",
        "<|Cough|>": "cough",
    }
    
    def __init__(self, model_path="iic/SenseVoiceSmall", load_model=True):
        """初始化 SenseVoice 模型"""
        if not load_model:
            return
            
        logger.info(f"Loading SenseVoice model from: {model_path}")
        print(f"DEBUG: Starting SenseVoice model load from {model_path}...")
        
        try:
            from modelscope.hub.snapshot_download import snapshot_download
            # Check if model exists or download it explicitly to show progress
            logging.getLogger("modelscope").setLevel(logging.INFO)
            print("DEBUG: Checking/Downloading model via modelscope...")
        except ImportError:
            pass

        self.model = AutoModel(
            model=model_path,
            vad_model="iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
            vad_kwargs={"max_single_segment_time": 30000},
            trust_remote_code=True,
        )
        
        logger.info("SenseVoice model loaded successfully")
        print("DEBUG: SenseVoice model loaded successfully!")
    
    def analyze(self, audio_bytes: bytes) -> Dict:
        """
        分析音频情感
        
        参数:
            audio_bytes: 音频字节数据
        
        返回:
            {
                "emotion": "HAPPY",
                "intensity": 0.85,
                "confidence": 0.92,
                "keywords": ["活动", "很棒"],
                "events": ["applause"],
                "raw_text": "这次活动很棒！",
                "language": "zh"
            }
        """
        # 预处理音频
        audio_array, sample_rate = self._preprocess_audio(audio_bytes)
        
        # 运行 SenseVoice 推理
        result = self.model.generate(
            input=audio_array,
            cache={},
            language="auto",
            use_itn=True,
            batch_size_s=60,
            merge_vad=True
        )
        
        # 解析结果
        raw_text = result[0]["text"]
        
        emotion, intensity = self._extract_emotion(raw_text)
        events = self._extract_events(raw_text)
        language = self._extract_language(raw_text)
        clean_text = self._clean_text(raw_text)
        keywords = self._extract_keywords(clean_text)
        
        return {
            "emotion": emotion,
            "intensity": intensity,
            "confidence": intensity,  # SenseVoice 的强度可作为置信度
            "keywords": keywords,
            "events": events,
            "raw_text": clean_text,
            "language": language,
            "full_result": raw_text  # 保留原始结果用于调试
        }
    
    def _preprocess_audio(self, audio_bytes: bytes) -> Tuple[np.ndarray, int]:
        """预处理音频数据"""
        # 从字节加载音频
        audio_buffer = io.BytesIO(audio_bytes)
        
        try:
            # 尝试加载音频
            waveform, sample_rate = torchaudio.load(audio_buffer)
        except Exception as e:
            # 如果失败，尝试作为原始 PCM 数据
            audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_array = audio_array.astype(np.float32) / 32768.0
            sample_rate = 16000
            
            return audio_array, sample_rate
        
        # 转换为 numpy
        audio_array = waveform.numpy()
        
        # 转为单声道
        if len(audio_array.shape) > 1 and audio_array.shape[0] > 1:
            audio_array = audio_array.mean(axis=0)
        else:
            audio_array = audio_array.squeeze()
        
        # 重采样到 16kHz
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            audio_tensor = torch.from_numpy(audio_array).float()
            if len(audio_tensor.shape) == 1:
                audio_tensor = audio_tensor.unsqueeze(0)
            audio_array = resampler(audio_tensor).squeeze().numpy()
            sample_rate = 16000
        
        return audio_array, sample_rate
    
    def _extract_emotion(self, text: str) -> Tuple[str, float]:
        """提取情感标签和强度"""
        emotion_counts = {}
        
        for tag, emotion in self.EMO_DICT.items():
            count = text.count(tag)
            if count > 0:
                emotion_counts[emotion] = count
        
        if not emotion_counts:
            return "NEUTRAL", 0.5
        
        # 找出出现最多的情感
        dominant_emotion = max(emotion_counts, key=emotion_counts.get)
        count = emotion_counts[dominant_emotion]
        
        # 计算强度（出现次数越多，强度越高）
        # 让起始分值更加动态，而不是固定的 0.7
        base_intensity = 0.65
        intensity = min(base_intensity + (count - 1) * 0.15, 0.98)
        
        # 针对 NEUTRAL 特殊处理，降低其置信度，鼓励系统识别更强烈的情绪
        if dominant_emotion == "NEUTRAL":
            intensity = min(intensity, 0.6)
            
        return dominant_emotion, intensity
    
    def _extract_events(self, text: str) -> List[str]:
        """提取音频事件"""
        events = []
        
        for tag, event in self.EVENT_DICT.items():
            if tag in text and event not in ['speech', 'breath']:
                events.append(event)
        
        return events
    
    def _extract_language(self, text: str) -> str:
        """提取检测到的语言"""
        lang_tags = {
            "<|zh|>": "zh",
            "<|en|>": "en",
            "<|yue|>": "yue",
            "<|ja|>": "ja",
            "<|ko|>": "ko",
        }
        
        for tag, lang in lang_tags.items():
            if tag in text:
                return lang
        
        return "unknown"
    
    def _clean_text(self, text: str) -> str:
        """清理文本，移除所有标签"""
        # 移除所有 <|xxx|> 格式的标签
        cleaned = re.sub(r'<\|[^>]+\|>', '', text)
        
        # 移除多余空格
        cleaned = ' '.join(cleaned.split())
        
        return cleaned.strip()
    
    def _extract_keywords(self, text: str, max_keywords: int = 4) -> List[str]:
        """使用 jieba 进行关键词提取，如果不可用则退回到词频"""
        if not text:
            return []
            
        if jieba:
            try:
                # 使用 TF-IDF 算法提取关键词
                keywords = jieba.analyse.extract_tags(text, topK=max_keywords)
                if keywords:
                    return keywords
            except Exception as e:
                logger.warning(f"Jieba extraction failed: {e}")

        # --- Fallback to simple logic (with better Chinese support) ---
        # 这种简单的正则在中文下通常会把整句当作一个词
        words = re.findall(r'[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}', text)
        
        # 过滤停用词
        stop_words = {'的', '了', '是', '我', '你', '他', '她', '它', '我们', '你们', '他们', '这个', '那个', '一个'}
        words = [w for w in words if w not in stop_words]
        
        # 统计词频
        word_freq = {}
        for word in words:
            word_freq[word] = word_freq.get(word, 0) + 1
        
        # 按频率排序，取前 N 个
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_words[:max_keywords]]


# 测试代码
if __name__ == "__main__":
    import sys
    
    logging.basicConfig(level=logging.INFO)
    
    analyzer = EmotionAnalyzer()
    print("✅ Analyzer initialized successfully")
    
    if len(sys.argv) > 1:
        # 测试文件
        audio_file = sys.argv[1]
        with open(audio_file, 'rb') as f:
            audio_bytes = f.read()
        
        result = analyzer.analyze(audio_bytes)
        print("\n分析结果:")
        print(f"  情感: {result['emotion']}")
        print(f"  强度: {result['intensity']:.2f}")
        print(f"  转录: {result['raw_text']}")
        print(f"  关键词: {result['keywords']}")