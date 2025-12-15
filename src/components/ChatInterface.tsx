
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { chatWithEcho } from '../services/geminiService';
import MarkdownText from './MarkdownText'; // Import the new MarkdownText component

const ChatInterface: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 'init', role: 'model', text: "I'm Echo. Upload a track to get started.", timestamp: Date.now() }]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    try {
        const responseText = await chatWithEcho(messages, input);
        const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
        setMessages(prev => [...prev, aiMsg]);
    } catch (err) { console.error(err); } finally { setIsTyping(false); }
  };

  return (
    <div className="flex flex-col h-[500px] bg-slate-900 rounded-3xl p-4 shadow-[6px_6px_12px_#090e1a,-6px_-6px_12px_#15203a]">
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-5 py-3 text-sm font-medium leading-relaxed ${msg.role === 'user' ? 'bg-slate-800 text-orange-400 rounded-2xl rounded-tr-sm shadow-[4px_4px_8px_#090e1a,-4px_-4px_8px_#1e293b]' : 'bg-slate-900 text-slate-300 rounded-2xl rounded-tl-sm shadow-[4px_4px_8px_#090e1a,-4px_-4px_8px_#1e293b]'}`}>
              {msg.role === 'model' ? <MarkdownText content={msg.text} /> : msg.text}
            </div>
          </div>
        ))}
        {isTyping && <div className="text-slate-500 text-xs italic">Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="pt-4 px-2 flex gap-4">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask Echo..." className="flex-1 bg-slate-900 rounded-full px-5 py-3 text-sm text-slate-200 focus:outline-none shadow-[inset_4px_4px_8px_#090e1a,inset_-4px_-4px_8px_#1e293b]" />
          <button onClick={handleSend} disabled={isTyping} className="w-12 h-12 rounded-full bg-slate-900 text-orange-400 flex items-center justify-center shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
      </div>
    </div>
  );
};
export default ChatInterface;
