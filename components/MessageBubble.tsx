
import React from 'react';
import { ChatMessage } from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isAi = message.role === 'ai';

  return (
    <div className={`flex w-full mb-6 ${isAi ? 'justify-start' : 'justify-end'}`}>
      <div className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isAi ? 'items-start' : 'items-end'}`}>
        <div className={`flex items-center mb-1 space-x-2 ${isAi ? 'flex-row' : 'flex-row-reverse space-x-reverse'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isAi ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white'}`}>
            {isAi ? <i className="fas fa-robot"></i> : <i className="fas fa-user"></i>}
          </div>
          <span className="text-xs font-medium text-gray-500">
            {isAi ? 'Gemini AI' : 'You'} • {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className={`rounded-2xl px-4 py-3 shadow-sm ${
          isAi 
            ? 'bg-white border border-gray-100 text-gray-800' 
            : 'bg-blue-600 text-white'
        }`}>
          {message.image && (
            <div className="mb-3 overflow-hidden rounded-lg">
              <img src={message.image} alt="User upload" className="max-h-64 w-full object-contain bg-black/5" />
            </div>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
