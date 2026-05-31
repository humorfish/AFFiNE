import { type ReactNode, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

const THEME = {
  overlay: 'transparent',
  panel: '#16162a',
  panelBorder: '#2a2a4a',
  text: '#e0e0e0',
  textMuted: '#8888aa',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleExtra?: ReactNode;
  width?: number;
  dismissible?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  titleExtra,
  width = 560,
  dismissible = true,
  children,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        onClose();
      }
    },
    [onClose, dismissible]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  const handleOverlayClick = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: THEME.overlay,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width,
          maxWidth: '90vw',
          maxHeight: '85vh',
          background: THEME.panel,
          border: `1px solid ${THEME.panelBorder}`,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${THEME.panelBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: THEME.text, fontSize: 16, fontWeight: 600 }}>
              {title}
            </span>
            {titleExtra}
          </div>
          {dismissible && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: THEME.textMuted,
                cursor: 'pointer',
                fontSize: 18,
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
