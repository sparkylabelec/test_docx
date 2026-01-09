
import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
// Changed to named import for better compatibility with Tiptap v2 extensions
import { BubbleMenu as BubbleMenuExtension } from '@tiptap/extension-bubble-menu';

import { generateAiWritingAssist } from './services/geminiService';
import { exportDocToDocx } from './services/exportService';
import { 
  Pencil, Trash2, Save, X, Check, ClipboardList, 
  Bold, Italic, Underline as UnderlineIcon, 
  RotateCcw, RotateCw, Eraser, Sparkles, Wand2,
  Image as ImageIcon, Loader2,
  List as ListIcon, ListOrdered, Move, GripHorizontal,
  FileDown
} from 'lucide-react';

interface Post {
  id: string;
  title: string;
  content: string;
  plainText: string;
  createdAt: string;
}

const App: React.FC = () => {
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  const [showAiPopup, setShowAiPopup] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg shadow-lg max-w-full my-4',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: '당신의 이야기를 이곳에 적어보세요...',
      }),
      // Register the BubbleMenu extension to enable the BubbleMenu React component
      BubbleMenuExtension,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] text-slate-800 leading-relaxed p-8',
      },
    },
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - popupPos.x,
      y: e.clientY - popupPos.y,
    };
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPopupPos({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = 'auto';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (showAiPopup) {
      setPopupPos({ x: 0, y: 0 });
    }
  }, [showAiPopup]);

  const handleAiAssist = async () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const isSelectionActive = from !== to;
    const selectedText = isSelectionActive 
      ? editor.state.doc.textBetween(from, to, ' ') 
      : null;

    if (!title && !editor.getText()) {
      setError("제목이나 내용을 입력해주세요!");
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsSelectionMode(isSelectionActive);

    try {
      const contextContent = isSelectionActive ? (selectedText || "") : editor.getHTML();
      const suggestion = await generateAiWritingAssist(
        title, 
        [{ id: '1', type: 'text', content: contextContent }],
        isSelectionActive
      );
      
      setAiResult(suggestion);
      setShowAiPopup(true);
    } catch (err: any) {
      setError("AI 처리 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const applyAiResult = () => {
    if (!editor) return;
    if (isSelectionMode) {
      editor.chain().focus().insertContent(aiResult).run();
    } else {
      editor.chain().focus().insertContent(`<p>${aiResult}</p>`).run();
    }
    setShowAiPopup(false);
    setAiResult('');
  };

  const handleSaveToBoard = () => {
    if (!editor || !title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    
    const newPost: Post = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      content: editor.getHTML(),
      plainText: editor.getText(),
      createdAt: new Date().toLocaleString('ko-KR', { 
        year: 'numeric', month: 'long', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      }),
    };

    setPosts(prev => [newPost, ...prev]);
    setTitle('');
    editor.commands.clearContent();
    setError(null);
  };

  const handleExportDocx = async () => {
    if (!editor) return;
    setIsLoading(true);
    try {
      const htmlContent = editor.getHTML();
      await exportDocToDocx(title, [{ id: 'export', type: 'text', content: htmlContent }]);
    } catch (err) {
      console.error(err);
      setError("파일 내보내기 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!editor) return null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 p-4 md:p-10 flex flex-col items-center">
      {showAiPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
          <div className="absolute inset-0 bg-slate-900/10 animate-in fade-in duration-200 pointer-events-auto" onClick={() => setShowAiPopup(false)}></div>
          <div 
            style={{ 
              transform: `translate(${popupPos.x}px, ${popupPos.y}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out'
            }}
            className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-200 flex flex-col max-h-[85vh] pointer-events-auto"
          >
            <div 
              onMouseDown={handleMouseDown}
              className={`px-8 py-5 bg-indigo-600 flex items-center justify-between text-white cursor-grab group ${isDragging ? 'cursor-grabbing' : ''}`}
            >
              <div className="flex items-center gap-3">
                <GripHorizontal size={20} className="text-indigo-300 group-hover:text-white transition-colors" />
                <Sparkles size={24} className="animate-pulse" />
                <h3 className="text-xl font-bold tracking-tight">AI 편집 제안</h3>
              </div>
              <button onClick={() => setShowAiPopup(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors active:scale-90">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 bg-white">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-slate-800 font-medium leading-relaxed whitespace-pre-wrap shadow-inner">
                {aiResult}
              </div>
            </div>

            <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex gap-3">
              <button onClick={() => setShowAiPopup(false)} className="flex-1 px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold hover:bg-slate-100 transition-all active:scale-95 shadow-sm">취소</button>
              <button onClick={applyAiResult} className="flex-[2] px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg transition-all active:scale-95">
                <Check size={20} /> 에디터에 적용하기
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl w-full bg-white shadow-2xl shadow-slate-200/50 rounded-3xl overflow-hidden flex flex-col mb-16 border border-slate-100">
        <div className="px-10 pt-10 pb-4 text-left">
          <div className="flex items-center mb-6">
            <span className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center mr-4 text-white shadow-xl shadow-indigo-100">
              <Pencil size={24} />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">새로운 포스트 작성</h1>
          </div>
          <input 
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="포스트 제목을 입력하세요"
            className="w-full text-4xl font-black border-none py-4 focus:ring-0 outline-none transition-colors placeholder:text-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center px-6 py-3 bg-white/80 backdrop-blur-md border-y border-slate-100 gap-2 sticky top-0 z-50">
          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="p-2.5 hover:bg-white rounded-lg text-slate-500 disabled:opacity-20 transition-all"><RotateCcw size={18} /></button>
            <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="p-2.5 hover:bg-white rounded-lg text-slate-500 disabled:opacity-20 transition-all"><RotateCw size={18} /></button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2.5 rounded-lg transition-all ${editor.isActive('bold') ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-600'}`}><Bold size={18} /></button>
            <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2.5 rounded-lg transition-all ${editor.isActive('italic') ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-600'}`}><Italic size={18} /></button>
            <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-2.5 rounded-lg transition-all ${editor.isActive('underline') ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-white text-slate-600'}`}><UnderlineIcon size={18} /></button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2.5 rounded-lg transition-all ${editor.isActive('bulletList') ? 'bg-indigo-600 text-white' : 'hover:bg-white text-slate-600'}`}><ListIcon size={18} /></button>
            <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-2.5 rounded-lg transition-all ${editor.isActive('orderedList') ? 'bg-indigo-600 text-white' : 'hover:bg-white text-slate-600'}`}><ListOrdered size={18} /></button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
            <button onClick={() => fileInputRef.current?.click()} className="p-2.5 hover:bg-white rounded-lg text-indigo-600 transition-all"><ImageIcon size={18} /></button>
            <button onClick={() => editor.commands.clearContent()} className="p-2.5 hover:bg-red-50 rounded-lg text-red-500 transition-all"><Eraser size={18} /></button>
          </div>

          <div className="flex-1 flex justify-end gap-2">
            <button onClick={handleAiAssist} disabled={isLoading} className="px-5 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-100 transition-all border border-indigo-200 shadow-sm disabled:opacity-50 min-w-[140px] justify-center">
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              <span>{isLoading ? '생성 중...' : 'AI 도움받기'}</span>
            </button>
            <button onClick={handleExportDocx} disabled={isLoading} className="px-5 py-2.5 bg-white text-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-50 border border-slate-200 shadow-sm transition-all active:scale-95">
              <FileDown size={16} />
              <span className="hidden lg:inline">Word로 저장</span>
            </button>
            <button onClick={handleSaveToBoard} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95">
              <Save size={16} />
              <span className="hidden md:inline">저장하기</span>
            </button>
          </div>
        </div>

        <div className="flex-1 bg-white relative">
          {editor && (
            <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }}>
              <div className="flex items-center bg-slate-900 text-white rounded-2xl shadow-2xl overflow-hidden p-1.5 border border-white/20 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                <button onClick={handleAiAssist} disabled={isLoading} className="flex items-center gap-2 px-4 py-2 hover:bg-indigo-600 rounded-xl transition-all text-xs font-bold">
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} className="text-indigo-400" />} AI 편집
                </button>
                <div className="w-[1px] h-4 bg-white/20 mx-1"></div>
                <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 hover:bg-white/10 rounded-lg transition-all ${editor.isActive('bold') ? 'text-indigo-400' : ''}`}><Bold size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 hover:bg-white/10 rounded-lg transition-all ${editor.isActive('italic') ? 'text-indigo-400' : ''}`}><Italic size={16} /></button>
              </div>
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="max-w-4xl w-full">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-10 bg-indigo-600 rounded-full"></div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">최근 저장된 글</h2>
          </div>
          <div className="text-sm font-bold text-slate-400 px-4 py-1.5 bg-white rounded-full border border-slate-100">총 {posts.length}개의 포스트</div>
        </div>
        
        {posts.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-[32px] p-24 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6 text-slate-300 shadow-inner"><ClipboardList size={40} /></div>
            <h3 className="text-xl font-bold text-slate-600">아직 작성된 글이 없네요</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
            {posts.map(post => (
              <div key={post.id} className="bg-white border border-slate-100 rounded-[32px] p-10 shadow-sm hover:shadow-2xl transition-all group flex flex-col relative overflow-hidden">
                <div className="absolute top-8 right-8 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => setPosts(prev => prev.filter(p => p.id !== post.id))} className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"><Trash2 size={20} /></button>
                </div>
                <div className="text-[12px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span> {post.createdAt}
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-5 line-clamp-1 pr-12">{post.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed line-clamp-4 flex-1 font-medium">{post.plainText || "내용이 없습니다."}</p>
                <div className="mt-10 pt-8 border-t border-slate-50 flex items-center justify-between">
                  <button onClick={() => { setTitle(post.title); editor.commands.setContent(post.content); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-sm font-black text-indigo-600 flex items-center gap-2 hover:gap-3 transition-all">포스트 불러오기 <RotateCw size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />

      {error && (
        <div className="fixed bottom-10 right-10 bg-slate-900 text-white px-8 py-5 rounded-[24px] shadow-2xl animate-in slide-in-from-bottom-10 flex items-center z-[100] border border-white/10 backdrop-blur-lg">
          <div className="bg-amber-500 p-2 rounded-xl mr-5"><X size={20} /></div>
          <span className="text-sm font-bold">{error}</span>
          <button onClick={() => setError(null)} className="ml-8 text-slate-400 hover:text-white transition-colors"><X size={24} /></button>
        </div>
      )}
    </div>
  );
};

export default App;
