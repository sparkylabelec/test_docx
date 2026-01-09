
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { generateAiWritingAssist } from './services/geminiService';
import { exportDocToDocx } from './services/exportService';
import { ContentBlock, BlockType } from './types';

const App: React.FC = () => {
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState<ContentBlock[]>([
    { id: 'initial', type: 'text' as BlockType, content: '' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // History for Undo/Redo
  const [history, setHistory] = useState<ContentBlock[][]>([[{ id: 'initial', type: 'text' as BlockType, content: '' }]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const pushToHistory = useCallback((newBlocks: ContentBlock[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newBlocks)));
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const updateBlock = (id: string, content: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setBlocks(JSON.parse(JSON.stringify(history[prevIndex])));
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setBlocks(JSON.parse(JSON.stringify(history[nextIndex])));
    }
  };

  const handleFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    setTimeout(() => pushToHistory(blocks), 100);
  };

  const handleTypography = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const parent = selection.anchorNode?.parentElement;
    if (parent?.tagName === 'H1') {
      document.execCommand('formatBlock', false, 'p');
    } else if (parent?.tagName === 'H2') {
      document.execCommand('formatBlock', false, 'h1');
    } else {
      document.execCommand('formatBlock', false, 'h2');
    }
    setTimeout(() => pushToHistory(blocks), 100);
  };

  const handleEraser = () => {
    if (window.confirm('모든 내용을 지우시겠습니까?')) {
      const resetBlocks: ContentBlock[] = [{ id: 'initial', type: 'text' as const, content: '' }];
      setBlocks(resetBlocks);
      pushToHistory(resetBlocks);
      setTitle('');
    }
  };

  const removeBlock = (id: string) => {
    const blockToRemove = blocks.find(b => b.id === id);
    if (blockToRemove?.type !== 'text' && blockToRemove?.content.startsWith('blob:')) {
      URL.revokeObjectURL(blockToRemove.content);
    }

    if (blocks.length <= 1) {
      const reset: ContentBlock[] = [{ id: 'initial', type: 'text' as const, content: '' }];
      setBlocks(reset);
      pushToHistory(reset);
      return;
    }
    const next = blocks.filter(b => b.id !== id);
    setBlocks(next);
    pushToHistory(next);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);
    setError(null);

    const newBlocks: ContentBlock[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/');
      
      const objectUrl = URL.createObjectURL(file);
      
      newBlocks.push({
        id: Math.random().toString(36).substr(2, 9),
        type: isVideo ? 'video' : 'image',
        content: objectUrl,
        mimeType: file.type
      });
      
      newBlocks.push({
        id: Math.random().toString(36).substr(2, 9),
        type: 'text',
        content: ''
      });
    }

    setBlocks(prev => {
      const next = [...prev, ...newBlocks];
      pushToHistory(next);
      return next;
    });

    setIsProcessingFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const handleAiAssist = async () => {
    if (blocks.every(b => b.type === 'text' && !b.content.trim())) return;
    setIsLoading(true);
    setError(null);
    try {
      const processedBlocks = await Promise.all(blocks.map(async (block) => {
        if ((block.type === 'image' || block.type === 'video') && block.content.startsWith('blob:')) {
          const response = await fetch(block.content);
          const blob = await response.blob();
          return new Promise<ContentBlock>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                ...block,
                content: (reader.result as string).split(',')[1] 
              });
            };
            reader.readAsDataURL(blob);
          });
        }
        return block;
      }));

      const suggestion = await generateAiWritingAssist(title, processedBlocks);
      const aiBlock: ContentBlock = {
        id: 'ai-' + Date.now(),
        type: 'text',
        content: `<div><br><strong>--- AI Suggestion ---</strong><br>${suggestion.replace(/\n/g, '<br>')}</div>`
      };
      setBlocks(prev => {
        const next = [...prev, aiBlock];
        pushToHistory(next);
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setError("AI 처리에 실패했습니다. " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
      await exportDocToDocx(title, blocks);
    } catch (e: any) {
      console.error(e);
      setError("문서 내보내기에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const colorPalette = [
    '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'
  ];

  // Calculate number of significant items for the badge
  const contentCount = useMemo(() => {
    return blocks.filter(b => b.type !== 'text' || b.content.replace(/<[^>]*>?/gm, '').trim().length > 0).length;
  }, [blocks]);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 p-4 md:p-8">
      <div className="max-w-4xl mx-auto border border-gray-200 bg-white shadow-xl flex flex-col min-h-[90vh] rounded-sm">
        
        {/* Top Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold mb-6 text-gray-900 tracking-tight">글쓰기</h1>
          <div className="flex items-center space-x-4">
            <label className="text-sm font-semibold text-gray-500 min-w-[40px]">제목</label>
            <input 
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              className="flex-1 border border-gray-300 rounded-sm p-2.5 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none transition-all"
            />
            <span className="text-red-500 font-bold">*</span>
          </div>
        </div>

        {/* Action Tags */}
        <div className="p-4 flex flex-wrap gap-2 border-b border-gray-100 bg-gray-50/50">
          {["서비스 이용약관", "운영정책", "이용제한 사유 안내"].map(tag => (
            <button key={tag} className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-[11px] font-bold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
              {tag}
            </button>
          ))}
          <button className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-[11px] font-bold flex items-center space-x-1.5 shadow-sm hover:bg-blue-700">
            <i className="fas fa-info-circle"></i>
            <span>작성 가이드</span>
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center p-2 bg-[#f8fafc] border-b border-gray-200 gap-1 overflow-x-auto no-scrollbar sticky top-0 z-10">
          <div className="flex space-x-1 px-2 border-r border-gray-300">
            <button onClick={handleUndo} disabled={historyIndex === 0} className={`p-2 hover:bg-gray-200 rounded ${historyIndex === 0 ? 'text-gray-300' : 'text-gray-600'}`} title="Undo">
              <i className="fas fa-undo"></i>
            </button>
            <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className={`p-2 hover:bg-gray-200 rounded ${historyIndex === history.length - 1 ? 'text-gray-300' : 'text-gray-600'}`} title="Redo">
              <i className="fas fa-redo"></i>
            </button>
          </div>
          <div className="flex space-x-1 px-2 border-r border-gray-300">
            <button onClick={handleTypography} className="p-2 hover:bg-gray-200 rounded font-serif italic text-lg text-gray-600" title="Typography">
              <i className="fas fa-paragraph"></i>
            </button>
          </div>
          <div className="flex space-x-1 px-2 border-r border-gray-300 font-bold text-gray-700">
            <button onClick={() => handleFormat('bold')} className="p-2 hover:bg-gray-200 rounded w-8" title="Bold">B</button>
            <button onClick={() => handleFormat('underline')} className="p-2 hover:bg-gray-200 rounded w-8 underline" title="Underline">U</button>
            <button onClick={() => handleFormat('italic')} className="p-2 hover:bg-gray-200 rounded w-8 italic font-serif" title="Italic">I</button>
            <div className="relative group">
              <button className="p-2 hover:bg-gray-200 rounded text-xs flex flex-col items-center" title="Color">
                <span className="leading-none">A</span>
                <div className="w-4 h-1 bg-red-500 mt-0.5"></div>
              </button>
              <div className="absolute hidden group-hover:block bg-white border border-gray-200 shadow-xl rounded p-3 top-full left-0 z-30 min-w-[200px]">
                <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Text Color</div>
                <div className="grid grid-cols-8 gap-1">
                  {colorPalette.map(color => (
                    <button 
                      key={color} 
                      onClick={() => handleFormat('foreColor', color)}
                      className="w-5 h-5 rounded-sm border border-gray-100 hover:scale-110 transition-transform" 
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex space-x-1 px-2 border-r border-gray-300">
            <button onClick={() => handleFormat('outdent')} className="p-2 hover:bg-gray-200 rounded text-gray-600" title="Decrease Indent">
              <i className="fas fa-outdent"></i>
            </button>
            <button onClick={() => handleFormat('indent')} className="p-2 hover:bg-gray-200 rounded text-gray-600" title="Increase Indent">
              <i className="fas fa-indent"></i>
            </button>
          </div>

          <div className="flex space-x-1 px-2 border-r border-gray-300">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-blue-50 rounded text-blue-600 transition-colors"
              title="이미지 추가"
            >
              <i className="fas fa-image text-lg"></i>
            </button>
            <button onClick={handleEraser} className="p-2 hover:bg-red-50 rounded text-red-400" title="Clear/Eraser">
              <i className="fas fa-eraser"></i>
            </button>
          </div>
          <div className="ml-auto flex items-center space-x-3 pr-2">
             <button 
              onClick={handleAiAssist}
              disabled={isLoading}
              className={`px-5 py-2 rounded-full text-xs font-bold flex items-center space-x-2 shadow-sm transition-all ${
                isLoading ? 'bg-gray-100 text-gray-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-md hover:scale-[1.02] active:scale-95'
              }`}
             >
               <i className={`fas ${isLoading ? 'fa-spinner animate-spin' : 'fa-magic'}`}></i>
               <span>AI 초안 작성</span>
             </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 bg-white p-8 overflow-y-auto no-scrollbar min-h-[500px] relative">
          {isProcessingFiles && (
            <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center backdrop-blur-[1px]">
               <div className="flex flex-col items-center">
                  <i className="fas fa-spinner animate-spin text-3xl text-blue-600 mb-2"></i>
                  <span className="text-sm font-medium text-gray-600">파일을 처리 중입니다...</span>
               </div>
            </div>
          )}
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <div key={block.id} className="relative group animate-in fade-in duration-300">
                {block.type === 'text' ? (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updateBlock(block.id, e.currentTarget.innerHTML)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        if (e.shiftKey) {
                          handleFormat('outdent');
                        } else {
                          handleFormat('indent');
                        }
                      }
                    }}
                    dangerouslySetInnerHTML={{ __html: block.content || (index === 0 && blocks.length === 1 ? '<span class="text-gray-300">내용을 입력하세요...</span>' : '') }}
                    className="w-full outline-none text-gray-800 leading-relaxed text-lg min-h-[1.5em] bg-transparent focus:ring-0"
                  />
                ) : block.type === 'image' ? (
                  <div className="my-6 relative inline-block group/img max-w-full">
                    <img 
                      src={block.content} 
                      alt="uploaded" 
                      className="max-h-[600px] w-auto rounded-sm border border-gray-100 shadow-sm transition-transform hover:scale-[1.005]" 
                    />
                    <button 
                      onClick={() => removeBlock(block.id)}
                      className="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ) : (
                  <div className="my-6 relative block group/vid max-w-full">
                    <div className="aspect-video bg-black rounded-sm overflow-hidden border border-gray-100 shadow-sm">
                      <video 
                        src={block.content} 
                        controls 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <button 
                      onClick={() => removeBlock(block.id)}
                      className="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover/vid:opacity-100 transition-opacity shadow-lg hover:bg-red-600 z-10"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => removeBlock(block.id)}
                  className="absolute -left-10 top-0 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Utility Bar */}
        <div className="p-3 bg-white border-t border-gray-200 flex justify-center items-center space-x-10">
           <button className="text-gray-500 hover:text-blue-500 transition-colors p-2"><i className="far fa-smile text-2xl"></i></button>
           <button className="text-gray-500 hover:text-blue-500 transition-colors p-2"><i className="fas fa-th text-2xl"></i></button>
           <button 
            onClick={() => videoInputRef.current?.click()}
            className="text-gray-500 hover:text-blue-500 transition-colors p-2"
            title="동영상 첨부"
           >
            <i className="fas fa-video text-2xl"></i>
           </button>
           <button className="text-gray-500 hover:text-blue-500 transition-colors p-2"><i className="fas fa-code text-2xl"></i></button>
           <button 
            onClick={handleExport}
            disabled={isLoading}
            className={`text-gray-500 hover:text-blue-600 transition-all relative p-2 active:scale-90 ${isLoading ? 'animate-pulse' : ''}`}
            title="문서 다운로드"
           >
             <i className="fas fa-file-download text-2xl"></i>
             {contentCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-white border-2 border-red-500 text-red-500 text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black shadow-sm">
                  {contentCount}
                </span>
             )}
           </button>
        </div>
      </div>

      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*"
      />
      <input 
        type="file" 
        multiple
        ref={videoInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="video/*"
      />

      {error && (
        <div className="fixed bottom-6 right-6 bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-bottom-10 flex items-center">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          <span className="mr-4">{error}</span>
          <button onClick={() => setError(null)} className="hover:text-gray-200"><i className="fas fa-times"></i></button>
        </div>
      )}
    </div>
  );
};

export default App;
