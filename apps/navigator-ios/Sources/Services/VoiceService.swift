import Foundation
import AVFoundation
import Combine

final class VoiceService: NSObject, ObservableObject {
    @Published var isSpeaking = false
    @Published var isMuted = false
    @Published var currentQueue: [VoiceCommand] = []
    
    private let synthesizer = AVSpeechSynthesizer()
    private var speechQueue: [String] = []
    private var isProcessingQueue = false
    
    override init() {
        super.init()
        synthesizer.delegate = self
        configureAudioSession()
    }
    
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Audio session error: \(error)")
        }
    }
    
    func speak(_ text: String, priority: CommandPriority = .normal) {
        guard !isMuted else { return }
        
        let command = VoiceCommand(text: text, priority: priority, createdAt: Date())
        
        if priority == .high {
            speechQueue.insert(text, at: 0)
        } else {
            speechQueue.append(text)
        }
        
        currentQueue.append(command)
        
        processQueue()
    }
    
    func speakInstruction(_ instruction: NavigationInstruction) {
        let distanceText = formatDistanceForSpeech(instruction.distance)
        let text = "\(distanceText), \(instruction.maneuverDescription)"
        speak(text, priority: .high)
    }
    
    func speakArrival(destination: String) {
        let text = "Вы прибыли в пункт назначения: \(destination)"
        speak(text, priority: .high)
    }
    
    func speakWarning(_ message: String) {
        speak(message, priority: .high)
    }
    
    func speakDistance(_ meters: Double) {
        let text = "Через \(formatDistanceForSpeech(meters))"
        speak(text)
    }
    
    func clearQueue() {
        speechQueue.removeAll()
        currentQueue.removeAll()
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
    }
    
    func toggleMute() {
        isMuted.toggle()
        
        if isMuted {
            synthesizer.stopSpeaking(at: .immediate)
            isSpeaking = false
        }
    }
    
    private func processQueue() {
        guard !isProcessingQueue, !speechQueue.isEmpty, !isMuted else { return }
        
        isProcessingQueue = true
        
        let text = speechQueue.removeFirst()
        
        if !currentQueue.isEmpty {
            currentQueue.removeFirst()
        }
        
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.9
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0
        utterance.preUtteranceDelay = 0.1
        utterance.postUtteranceDelay = 0.1
        
        synthesizer.speak(utterance)
    }
    
    private func formatDistanceForSpeech(_ meters: Double) -> String {
        if meters >= 1000 {
            let km = meters / 1000
            if km.truncatingRemainder(dividingBy: 1) == 0 {
                return "\(Int(km)) километров"
            } else {
                let wholeKm = Int(km)
                let hundreds = Int((km - Double(wholeKm)) * 10) * 100
                return "\(wholeKm) целых \(hundreds) метров"
            }
        } else if meters >= 100 {
            let hundreds = Int(meters / 100) * 100
            let remainder = Int(meters) % 100
            if remainder == 0 {
                return "\(hundreds) метров"
            } else {
                return "\(hundreds) \(remainder) метров"
            }
        } else if meters >= 20 {
            let tens = (Int(meters) / 10) * 10
            let ones = Int(meters) % 10
            if ones == 0 {
                return "\(tens) метров"
            } else {
                return "\(tens) \(ones) метров"
            }
        } else {
            switch Int(meters) {
            case 0: return "0 метров"
            case 1: return "1 метр"
            case 2, 3, 4: return "\(Int(meters)) метра"
            default: return "\(Int(meters)) метров"
            }
        }
    }
}

extension VoiceService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = true
        }
    }
    
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isProcessingQueue = false
            self.processQueue()
        }
    }
    
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
            self.isProcessingQueue = false
        }
    }
}

struct VoiceCommand: Identifiable {
    let id = UUID()
    let text: String
    let priority: CommandPriority
    let createdAt: Date
}

enum CommandPriority {
    case low
    case normal
    case high
}