#!/usr/bin/env python3
"""Test script to verify messenger modules"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'ai_engine', 'agent'))

def test_imports():
    """Test that we can import the modules"""
    try:
        from messenger_modules import MessengerSystem, ChatStorage, E2EEProtocol, WebSocketChatServer
        print("✓ All imports successful")
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False

def test_messenger_system():
    """Test MessengerSystem initialization"""
    try:
        from messenger_modules import MessengerSystem
        messenger = MessengerSystem()
        print("✓ MessengerSystem initialized")
        return True
    except Exception as e:
        print(f"✗ MessengerSystem initialization failed: {e}")
        return False

def test_chat_storage():
    """Test ChatStorage initialization"""
    try:
        from messenger_modules import ChatStorage
        storage = ChatStorage("test_chats.db")
        print("✓ ChatStorage initialized")
        
        # Clean up
        if os.path.exists("test_chats.db"):
            os.remove("test_chats.db")
        return True
    except Exception as e:
        print(f"✗ ChatStorage initialization failed: {e}")
        return False

def test_e2ee_protocol():
    """Test E2EE protocol"""
    try:
        from messenger_modules import E2EEProtocol
        e2ee = E2EEProtocol()
        print("✓ E2EEProtocol initialized")
        
        # Test keypair generation
        keys = e2ee.generate_keypair()
        print(f"✓ Keypair generated: {len(keys['private'])} chars private, {len(keys['public'])} chars public")
        
        # Test session key derivation
        session_key = e2ee.derive_session_key(keys['private'], keys['public'])
        print(f"✓ Session key derived: {len(session_key)} bytes")
        
        # Test encryption/decryption
        test_message = "Hello, world!"
        ciphertext, nonce = e2ee.encrypt_message(test_message, session_key)
        decrypted = e2ee.decrypt_message(ciphertext, session_key, nonce)
        if decrypted == test_message:
            print("✓ Encryption/decryption successful")
        else:
            print(f"✗ Encryption/decryption failed: got '{decrypted}' expected '{test_message}'")
            return False
            
        return True
    except Exception as e:
        print(f"✗ E2EEProtocol test failed: {e}")
        return False

def test_presence_system():
    """Test PresenceSystem"""
    try:
        from messenger_modules import PresenceSystem
        presence = PresenceSystem()
        print("✓ PresenceSystem initialized")
        
        # Test user online/offline
        presence.user_online("user1")
        online = presence.get_online()
        if "user1" in online:
            print("✓ User online tracking works")
        else:
            print("✗ User online tracking failed")
            return False
            
        presence.user_offline("user1")
        online = presence.get_online()
        if "user1" not in online:
            print("✓ User offline tracking works")
        else:
            print("✗ User offline tracking failed")
            return False
            
        return True
    except Exception as e:
        print(f"✗ PresenceSystem test failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing messenger modules...")
    print("=" * 50)
    
    tests = [
        test_imports,
        test_messenger_system,
        test_chat_storage,
        test_e2ee_protocol,
        test_presence_system,
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()
    
    print("=" * 50)
    print(f"Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("✓ All tests passed!")
        sys.exit(0)
    else:
        print("✗ Some tests failed!")
        sys.exit(1)