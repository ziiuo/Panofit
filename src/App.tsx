import { useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import { pageEnter, pageLeave } from './utils/analytics';
import HomePage from './components/HomePage';
import UploadPage from './components/UploadPage';
import EditorPage from './components/EditorPage';
import PreviewPage from './components/PreviewPage';
import SavePage from './components/SavePage';

export default function App() {
  const page = useAppStore((s) => s.page);
  const prevPage = useRef<string | null>(null);
  const enterDebounce = useRef(0);

  useEffect(() => {
    // pageLeave for previous page
    if (prevPage.current && prevPage.current !== page) {
      pageLeave(prevPage.current);
    }
    // pageEnter for new page (debounce 1s to avoid StrictMode dupes)
    if (page !== prevPage.current) {
      const now = Date.now();
      if (now - enterDebounce.current > 1000) {
        pageEnter(page);
        enterDebounce.current = now;
      }
    }
    prevPage.current = page;
  }, [page]);

  useEffect(() => {
    pageEnter('home');
    prevPage.current = 'home';
    enterDebounce.current = Date.now();
    const handleUnload = () => pageLeave(useAppStore.getState().page);
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-bg">
      {page === 'home' && <HomePage />}
      {page === 'upload' && <UploadPage />}
      {page === 'editor' && <EditorPage />}
      {page === 'preview' && <PreviewPage />}
      {page === 'save' && <SavePage />}
    </div>
  );
}
