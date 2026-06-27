import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, Maximize2, List } from 'lucide-react';
import { api } from '../api/client';
import type { PdfFile } from '../api/types';
import { Button } from './ui/button';
import { useT } from '../context/I18nContext';

// Import Mozilla PDF.js standard styles for the text layer (enables text selection alignment)
import 'pdfjs-dist/web/pdf_viewer.css';

// Set standard PDF.js worker path to unpkg matching the installed pdfjs-dist version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type PdfReaderPaneProps = {
  pdf: PdfFile;
  jumpPageTrigger?: { page: number; ts: number };
};

type OutlineItem = {
  level: number;
  title: string;
  page: number;
};

// Sub-component: A lazy-loaded PDF page wrapper that renders canvas and text layer only when approaching the viewport.
function PdfPageItem({
  pageNum,
  pdfDoc,
  scale,
  containerWidth,
  onRegisterRef,
}: {
  pageNum: number;
  pdfDoc: any;
  scale: number;
  containerWidth: number;
  onRegisterRef: (el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const [aspectRatio, setAspectRatio] = useState(0.707); // Default A4 ratio
  const [shouldRender, setShouldRender] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  // Fetch page dimensions to set the correct container aspect-ratio placeholder (prevents layout shifting)
  useEffect(() => {
    if (!pdfDoc) return;
    let active = true;
    const getPageSize = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        if (active) {
          setAspectRatio(viewport.width / viewport.height);
        }
      } catch (err) {
        console.error(`Error loading dimensions for page ${pageNum}:`, err);
      }
    };
    getPageSize();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum]);

  // Use IntersectionObserver to lazy-load page canvas rendering 250px before entering viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
        } else {
          // De-render to free up memory on long documents when scrolled far away
          setShouldRender(false);
          setIsRendered(false);
        }
      },
      {
        root: null, // viewport
        rootMargin: '250px 0px', // buffer zone
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Render the PDF page canvas and transparent selectable text layer
  useEffect(() => {
    if (!pdfDoc || !shouldRender || !canvasRef.current || !textLayerRef.current) return;

    let active = true;
    let renderTask: any = null;
    let textLayerInstance: any = null;

    const render = async () => {
      setPageLoading(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!active) return;

        const canvas = canvasRef.current;
        const textLayerDiv = textLayerRef.current;
        if (!canvas || !textLayerDiv) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Base width calculation relative to current container width with margins
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = Math.max(containerWidth - 32, 280);
        const displayWidth = targetWidth * scale;
        const renderScale = displayWidth / unscaledViewport.width;

        const viewport = page.getViewport({ scale: renderScale });
        const dpr = window.devicePixelRatio || 1;

        // Configure canvas sizing
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.scale(dpr, dpr);

        // Render PDF page vector contents onto Canvas
        renderTask = page.render({
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;

        if (!active) return;

        // Clear and resize text layer container
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        // Render PDF text layer nodes over canvas for browser selection support
        const textContent = await page.getTextContent();
        if (!active) return;

        textLayerInstance = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        await textLayerInstance.render();

        if (active) {
          setIsRendered(true);
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      } finally {
        if (active) {
          setPageLoading(false);
        }
      }
    };

    render();
    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
      if (textLayerInstance) {
        textLayerInstance.cancel();
      }
      // Explicitly set width/height to 0 on canvas to deallocate graphics memory buffer immediately
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
    };
  }, [pdfDoc, shouldRender, pageNum, scale, containerWidth]);

  // Sizing calculations for page skeleton wrapper
  const targetWidth = Math.max(containerWidth - 32, 280);
  const displayWidth = targetWidth * scale;
  const displayHeight = displayWidth / aspectRatio;

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        onRegisterRef(el);
      }}
      data-page-index={pageNum}
      style={{
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
      }}
      className="relative flex items-center justify-center bg-card shadow-md rounded border border-border/30 overflow-hidden my-4 shrink-0 transition-shadow duration-200 hover:shadow-lg"
    >
      {shouldRender && (
        <div className="absolute inset-0 w-full h-full">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
          {/* Transparent selectable text layer aligned perfectly over the canvas */}
          <div
            ref={textLayerRef}
            className="textLayer absolute inset-0 z-10 pointer-events-auto select-text select-all"
          />
        </div>
      )}

      {/* Loading state indicator */}
      {(!isRendered || pageLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/60 backdrop-blur-[1px]">
          <Loader2 className="animate-spin text-muted-foreground/60" size={20} />
        </div>
      )}
    </div>
  );
}

export default function PdfReaderPane({ pdf, jumpPageTrigger }: PdfReaderPaneProps) {
  const { t } = useT();
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(pdf.last_preview_page || 1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [isAutoScaled, setIsAutoScaled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // TOC Outline State
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [pageInput, setPageInput] = useState(String(currentPage));

  // Measure container width for responsive page sizing
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setContainerWidth(el.clientWidth);
    
    return () => {
      observer.disconnect();
    };
  }, []);

  // Fetch PDF document and table of contents outline
  useEffect(() => {
    let isCurrent = true;
    let activeLoadingTask: any = null;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setOutline([]);

    const loadPdfAndOutline = async () => {
      try {
        const fileUrl = `/api/pdfs/${pdf.id}/file`;
        const response = await api<Response>(fileUrl);
        const arrayBuffer = await response.arrayBuffer();

        if (!isCurrent) return;

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        activeLoadingTask = loadingTask;
        const doc = await loadingTask.promise;

        if (!isCurrent) {
          loadingTask.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // Fetch outline from the backend
        try {
          const outlineData = await api<OutlineItem[]>(`/api/pdfs/${pdf.id}/outline`);
          if (isCurrent) {
            setOutline(outlineData || []);
            // Auto open TOC if outline is available on load (handy desktop feature)
            if (outlineData && outlineData.length > 0 && window.innerWidth > 1024) {
              setShowToc(true);
            }
          }
        } catch (tocErr) {
          console.warn('Outline not fetched or not found:', tocErr);
        }
      } catch (err: any) {
        console.error('Error loading PDF:', err);
        if (isCurrent) {
          setError(err?.message || 'Failed to load PDF file.');
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    loadPdfAndOutline();

    return () => {
      isCurrent = false;
      if (activeLoadingTask) {
        activeLoadingTask.destroy();
      }
    };
  }, [pdf.id]);

  // Sync current visible page index to backend database
  const lastSyncedPage = useRef<number>(pdf.last_preview_page || 1);
  const isInitialScrolled = useRef(false);

  useEffect(() => {
    const initialPage = pdf.last_preview_page || 1;
    setCurrentPage(initialPage);
    setPageInput(String(initialPage));
    setNumPages(0);
    pageRefs.current = {};
    lastSyncedPage.current = initialPage;
    isInitialScrolled.current = false;
  }, [pdf.id]);
  useEffect(() => {
    if (currentPage === lastSyncedPage.current) return;

    const syncPage = async () => {
      try {
        lastSyncedPage.current = currentPage;
        await api(`/api/pdfs/${pdf.id}/last-page`, {
          method: 'PATCH',
          body: JSON.stringify({ page: currentPage }),
        });
      } catch (err) {
        console.error('Failed to sync last reading page index:', err);
      }
    };

    const timer = setTimeout(syncPage, 1000);
    return () => clearTimeout(timer);
  }, [currentPage, pdf.id]);

  // IntersectionObserver to dynamically track which page is currently most visible in viewport
  useEffect(() => {
    if (!pdfDoc || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageIdx = Number(entry.target.getAttribute('data-page-index'));
            if (pageIdx && !isNaN(pageIdx)) {
              setCurrentPage(pageIdx);
            }
          }
        });
      },
      {
        root: viewportRef.current,
        // Trigger intersection active page when page centers in viewport top third section
        rootMargin: '-20% 0px -50% 0px',
        threshold: 0.1,
      }
    );

    // Observe each page element wrapper after they are rendered
    const timer = setTimeout(() => {
      const pageElements = viewportRef.current?.querySelectorAll('[data-page-index]');
      pageElements?.forEach((el) => observer.observe(el));
    }, 600);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [pdfDoc, loading, scale]);

  // Scroll to saved initial page on load
  useEffect(() => {
    isInitialScrolled.current = false;
  }, [pdf.id]);

  useEffect(() => {
    if (pdfDoc && !isInitialScrolled.current && !loading) {
      const initialPage = pdf.last_preview_page || 1;
      const timer = setTimeout(() => {
        const targetEl = pageRefs.current[initialPage];
        if (targetEl && viewportRef.current) {
          targetEl.scrollIntoView({ block: 'start' });
          isInitialScrolled.current = true;
        }
      }, 700); // Give canvas shell wrappers ample mount buffer time
      return () => clearTimeout(timer);
    }
  }, [pdfDoc, loading]);

  // Trigger external page jumps (e.g. from TTS conversion page range locate link)
  useEffect(() => {
    if (jumpPageTrigger && pdfDoc && !loading) {
      scrollToPage(jumpPageTrigger.page);
    }
  }, [jumpPageTrigger, pdfDoc, loading]);

  // Scroll viewport to a specific page
  const scrollToPage = (pageNum: number) => {
    const container = viewportRef.current;
    const target = pageRefs.current[pageNum];
    if (container && target) {
      // Calculate target's position relative to the scroll container's content
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const relativeTop = targetRect.top - containerRect.top + container.scrollTop;

      // Offset container padding-top (16px) so the page aligns perfectly at the top edge
      const finalScrollTop = Math.max(relativeTop - 16, 0);
      const scrollDiff = Math.abs(container.scrollTop - finalScrollTop);

      if (scrollDiff < 1500) {
        // Near jump: perform standard smooth scroll
        container.scrollTo({ top: finalScrollTop, behavior: 'smooth' });
      } else {
        // Far jump: teleport close to target (150px away) instantly, then slide smoothly the remaining distance
        const startNearY = finalScrollTop > container.scrollTop
          ? finalScrollTop - 150
          : finalScrollTop + 150;
        
        container.scrollTo({ top: startNearY, behavior: 'auto' });
        
        // Wait a frame for browser layout to settle, then execute smooth scroll
        setTimeout(() => {
          container.scrollTo({ top: finalScrollTop, behavior: 'smooth' });
        }, 30);
      }
      
      setCurrentPage(pageNum);
    }
  };

  const goToPrevPage = () => {
    const prev = Math.max(currentPage - 1, 1);
    scrollToPage(prev);
  };

  const goToNextPage = () => {
    const next = Math.min(currentPage + 1, numPages);
    scrollToPage(next);
  };

  const zoomIn = () => {
    setIsAutoScaled(false);
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  };

  const zoomOut = () => {
    setIsAutoScaled(false);
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  // Sync input value with current scroll page index
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const handlePageSubmit = () => {
    const val = parseInt(pageInput, 10);
    if (!isNaN(val) && val >= 1 && val <= numPages) {
      scrollToPage(val);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePageSubmit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setPageInput(String(currentPage));
      e.currentTarget.blur();
    }
  };

  const resetFit = () => {
    setIsAutoScaled(true);
    setScale(1.0);
  };

  return (
    <div className="pdf-reader-pane flex flex-col h-full w-full bg-background select-none overflow-hidden">
      {/* Reader Header Toolbar */}
      <div className="pdf-reader-toolbar flex items-center justify-between px-3 py-2 bg-card border-b border-border gap-2 shrink-0">
        {/* Outline Toggle & Navigation */}
        <div className="flex items-center gap-1">
          {outline.length > 0 && (
            <Button
              variant={showToc ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setShowToc((prev) => !prev)}
              className="h-8 w-8"
              title="Table of Contents"
            >
              <List size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevPage}
            disabled={currentPage <= 1 || loading || !pdfDoc}
            className="h-8 w-8"
          >
            <ChevronLeft size={16} />
          </Button>
          
          <div className="flex items-center gap-1 text-xs select-none">
            <input
              type="text"
              size={4}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageSubmit}
              onKeyDown={handleKeyDown}
              onFocus={(e) => e.target.select()}
              disabled={loading || !pdfDoc}
              className="h-7 px-1 py-0 text-center border border-border rounded bg-background font-semibold text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring transition-colors disabled:opacity-50"
            />
            <span className="text-muted-foreground">/</span>
            <span className="font-medium pr-1">{numPages || '...'}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNextPage}
            disabled={currentPage >= numPages || loading || !pdfDoc}
            className="h-8 w-8"
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            disabled={scale <= 0.5 || loading || !pdfDoc}
            className="h-8 w-8"
          >
            <ZoomOut size={15} />
          </Button>
          <span className="text-xs font-semibold min-w-[36px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            disabled={scale >= 3.0 || loading || !pdfDoc}
            className="h-8 w-8"
          >
            <ZoomIn size={15} />
          </Button>
          
          <Button
            variant={isAutoScaled ? "secondary" : "ghost"}
            size="icon"
            onClick={resetFit}
            disabled={loading || !pdfDoc}
            className="h-8 w-8 ml-1"
            title="Fit Width"
          >
            <Maximize2 size={14} />
          </Button>
        </div>
      </div>

      {/* Main Panel Area: Sidebar + Viewport Container */}
      <div className="flex-1 flex overflow-hidden relative w-full min-h-0">
        
        {/* Table of Contents (Outline) Sidebar */}
        {showToc && outline.length > 0 && (
          <div className="pdf-toc-sidebar w-64 border-r border-border bg-card flex flex-col overflow-hidden h-full z-10 shrink-0">
            <div className="p-3 border-b border-border font-semibold text-xs flex justify-between items-center bg-[#1f2937]/5">
              <span>{t('outline') || '目录'}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowToc(false)}
                className="h-6 w-6"
              >
                <ChevronLeft size={14} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 scrollbar-thin">
              <div className="flex flex-col gap-0.5">
                {outline.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => scrollToPage(item.page)}
                    className={`text-left text-xs py-2 px-2.5 rounded hover:bg-[#1f2937]/5 transition-colors duration-150 flex items-center justify-between gap-2 group ${
                      currentPage === item.page
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    style={{ paddingLeft: `${Math.max(8, item.level * 14)}px` }}
                  >
                    <span className="truncate flex-1">{item.title}</span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 group-hover:text-muted-foreground">
                      P. {item.page}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PDF Page List Viewport */}
        <div
          ref={viewportRef}
          className="pdf-viewport-container flex-1 overflow-y-auto overflow-x-hidden bg-[#1f2937]/5 p-4 flex flex-col items-center relative min-h-0 scrollbar-thin"
        >
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/75 z-10 gap-2">
              <Loader2 className="animate-spin text-ring" size={24} />
              <span className="text-xs text-muted-foreground font-semibold">{t('loading') || '加载中...'}</span>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-background/90 z-10 gap-3">
              <div className="text-destructive font-semibold text-sm">Failed to open document</div>
              <div className="text-xs text-muted-foreground max-w-sm">{error}</div>
            </div>
          )}

          {pdfDoc && (
            <div className="flex flex-col items-center w-full min-h-full select-text">
              {Array.from({ length: numPages }).map((_, index) => {
                const pNum = index + 1;
                return (
                  <PdfPageItem
                    key={`${pdf.id}-${pNum}`}
                    pageNum={pNum}
                    pdfDoc={pdfDoc}
                    scale={scale}
                    containerWidth={containerWidth}
                    onRegisterRef={(el) => {
                      pageRefs.current[pNum] = el;
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
