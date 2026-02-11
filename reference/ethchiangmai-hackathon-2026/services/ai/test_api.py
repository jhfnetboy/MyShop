#!/usr/bin/env python3
# test_api.py - 测试 API 端点

import requests
import json
import sys
from pathlib import Path

API_BASE_URL = "http://localhost:8001"

def test_health():
    """测试健康检查端点"""
    print("\n" + "="*60)
    print("Testing Health Check Endpoint")
    print("="*60)
    
    response = requests.get(f"{API_BASE_URL}/health")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200

def test_public_key():
    """测试获取公钥端点"""
    print("\n" + "="*60)
    print("Testing Public Key Endpoint")
    print("="*60)
    
    response = requests.get(f"{API_BASE_URL}/public-key")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200

def test_analyze(audio_file: str):
    """测试音频分析端点"""
    print("\n" + "="*60)
    print("Testing Audio Analysis Endpoint")
    print("="*60)
    
    if not Path(audio_file).exists():
        print(f"❌ Audio file not found: {audio_file}")
        return False
    
    print(f"Uploading audio file: {audio_file}")
    
    with open(audio_file, 'rb') as f:
        files = {'audio': (Path(audio_file).name, f, 'audio/wav')}
        response = requests.post(f"{API_BASE_URL}/analyze", files=files)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("\n✅ Analysis Successful!")
        print("\nEmotion Analysis:")
        print(f"  Emotion: {result['result']['emotion']}")
        print(f"  Intensity: {result['result']['intensity']:.2f}")
        print(f"  Confidence: {result['result']['confidence']:.2f}")
        print(f"  Transcript: {result['result']['transcript']}")
        print(f"  Keywords: {result['result']['keywords']}")
        
        print("\nCryptographic Data:")
        print(f"  Audio Hash: {result['crypto']['audio_hash'][:32]}...")
        print(f"  Result Hash: {result['crypto']['result_hash'][:32]}...")
        print(f"  Signature: {result['crypto']['signature'][:32]}...")
        print(f"  Public Key: {result['crypto']['public_key'][:32]}...")
        print(f"  Verified: {result['crypto']['verified']}")
        
        return True
    else:
        print(f"❌ Error: {response.text}")
        return False

def test_verify(crypto_data: dict):
    """测试签名验证端点"""
    print("\n" + "="*60)
    print("Testing Signature Verification Endpoint")
    print("="*60)
    
    response = requests.post(f"{API_BASE_URL}/verify", json=crypto_data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.status_code == 200

def main():
    print("="*60)
    print("EchoRank AI Backend API Test Suite")
    print("="*60)
    
    # 测试服务是否运行
    try:
        response = requests.get(f"{API_BASE_URL}/")
        print(f"\n✅ Service is running")
        print(f"   Version: {response.json()['version']}")
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Service is not running!")
        print("   Please start the service first: python app.py")
        sys.exit(1)
    
    # 运行测试
    results = []
    
    results.append(("Health Check", test_health()))
    results.append(("Public Key", test_public_key()))
    
    # 如果提供了音频文件，测试分析功能
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        results.append(("Audio Analysis", test_analyze(audio_file)))
    else:
        print("\n⚠️  Skipping audio analysis test (no audio file provided)")
        print("   Usage: python test_api.py <audio_file.wav>")
    
    # 输出测试结果
    print("\n" + "="*60)
    print("Test Results Summary")
    print("="*60)
    
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name:.<40} {status}")
    
    total = len(results)
    passed = sum(results, key=lambda x: x[1])
    print(f"\nTotal: {passed}/{total} tests passed")
    
    return 0 if passed == total else 1

if __name__ == "__main__":
    sys.exit(main())