# bls_signer.py - BLS 签名实现
"""
使用 BLS12-381 曲线实现阈值签名
"""

from py_ecc.bls import G2ProofOfPossession as bls
import hashlib
import logging

logger = logging.getLogger(__name__)


class BLSSigner:
    """BLS 签名器"""
    
    def __init__(self, private_key_hex: str):
        """
        初始化签名器
        
        参数:
            private_key_hex: 私钥的十六进制字符串
        """
        self.sk = int(private_key_hex, 16)
        self.pk = bls.SkToPk(self.sk)
        
        logger.info(f"BLS Signer initialized with public key: {self.pk.hex()[:16]}...")
    
    def sign_message(self, message: bytes) -> bytes:
        """
        对消息进行 BLS 签名
        
        参数:
            message: 待签名的消息（字节）
        
        返回:
            签名（字节）
        """
        signature = bls.Sign(self.sk, message)
        return signature
    
    @staticmethod
    def verify_signature(public_key: bytes, message: bytes, signature: bytes) -> bool:
        """
        验证 BLS 签名
        
        参数:
            public_key: 公钥
            message: 原始消息
            signature: 签名
        
        返回:
            是否有效
        """
        try:
            return bls.Verify(public_key, message, signature)
        except Exception as e:
            logger.error(f"Signature verification failed: {e}")
            return False
    
    @staticmethod
    def aggregate_signatures(signatures: list) -> bytes:
        """
        聚合多个签名
        
        参数:
            signatures: 签名列表
        
        返回:
            聚合签名
        """
        return bls.Aggregate(signatures)
    
    @staticmethod
    def aggregate_verify(
        public_keys: list,
        message: bytes,
        aggregated_sig: bytes
    ) -> bool:
        """
        验证聚合签名（所有节点签署同一消息）
        
        参数:
            public_keys: 公钥列表
            message: 原始消息
            aggregated_sig: 聚合签名
        
        返回:
            是否有效
        """
        try:
            # 聚合公钥
            agg_pk = public_keys[0]
            for pk in public_keys[1:]:
                agg_pk = bls.aggregate_pubkeys([agg_pk, pk])
            
            # 验证聚合签名
            return bls.Verify(agg_pk, message, aggregated_sig)
        except Exception as e:
            logger.error(f"Aggregated signature verification failed: {e}")
            return False


def construct_message(
    audio_hash: str,
    result_hash: str,
    algo_version: str,
    timestamp: int,
    nonce: str
) -> bytes:
    """
    构造待签名消息
    
    消息格式:
    m = domain_sep || audio_hash || result_hash || algo_version || timestamp || nonce
    
    参数:
        audio_hash: 音频哈希
        result_hash: 结果哈希
        algo_version: 算法版本
        timestamp: 时间戳
        nonce: 随机数
    
    返回:
        消息的 SHA256 哈希
    """
    domain_sep = "ECHORANK_V1"
    
    message_parts = [
        domain_sep,
        audio_hash,
        result_hash,
        algo_version,
        str(timestamp),
        nonce
    ]
    
    message_str = "||".join(message_parts)
    message_bytes = message_str.encode('utf-8')
    
    # 返回消息的哈希（标准做法）
    return hashlib.sha256(message_bytes).digest()


# 测试代码
if __name__ == "__main__":
    import secrets
    import time
    
    logging.basicConfig(level=logging.INFO)
    
    # 生成测试密钥
    sk_hex = hex(secrets.randbelow(bls.curve_order))
    print(f"Private Key: {sk_hex}")
    
    # 创建签名器
    signer = BLSSigner(sk_hex)
    print(f"Public Key: {signer.pk.hex()}")
    
    # 构造测试消息
    message = construct_message(
        audio_hash="test_audio_hash",
        result_hash="test_result_hash",
        algo_version="v1.0.0",
        timestamp=int(time.time()),
        nonce=secrets.token_hex(16)
    )
    
    # 签名
    signature = signer.sign_message(message)
    print(f"\nSignature: {signature.hex()[:32]}...")
    
    # 验证
    is_valid = BLSSigner.verify_signature(signer.pk, message, signature)
    print(f"Verification: {'✅ Valid' if is_valid else '❌ Invalid'}")