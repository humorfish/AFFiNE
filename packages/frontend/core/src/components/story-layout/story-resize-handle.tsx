import { useCallback, useRef, useState } from 'react';

interface StoryResizeHandleProps {
  onWidthChange: (width: number) => void;
  onWidthChanged: (width: number) => void;
  onResizingChange: (resizing: boolean) => void;
  minWidth: number; // 280
  maxWidth: number; // 600
}

export const StoryResizeHandle = ({
  onWidthChange,
  onWidthChanged,
  onResizingChange,
  minWidth,
  maxWidth,
}: StoryResizeHandleProps) => {
  const anchorRightRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);
  const lastWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Record the anchor position from the container's parent
      const container = e.currentTarget.parentElement;
      if (container) {
        anchorRightRef.current =
          container.parentElement?.getBoundingClientRect().right ?? 0;
      }

      // Set up event listeners on document
      const onMouseMove = (e: MouseEvent) => {
        // Calculate new width based on mouse position
        const newWidth = Math.min(
          maxWidth,
          Math.max(minWidth, anchorRightRef.current - e.clientX)
        );

        // Store the width for when resizing ends
        lastWidthRef.current = newWidth;
        onWidthChange(newWidth);
      };

      const onMouseUp = () => {
        // Clean up event listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Reset cursor state
        document.body.style.cursor = '';
        onResizingChange(false);
        onWidthChanged(lastWidthRef.current);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      // Update cursor state
      document.body.style.cursor = 'col-resize';
      onResizingChange(true);
    },
    [onResizingChange, onWidthChange, onWidthChanged, minWidth, maxWidth]
  );

  return (
    <div
      className="story-resize-handle"
      style={{
        width: '6px',
        cursor: 'col-resize',
        background: 'var(--affine-border-color, #2a2a4a)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.2s ease',
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="resize-handle-bar"
        style={{
          width: isHovered ? '4px' : '3px',
          height: '20px',
          background: 'var(--affine-primary-color, #6c5ce7)',
          borderRadius: '4px',
          opacity: (() => {
            if (document.body.style.cursor === 'col-resize') return 1.0;
            return isHovered ? 0.8 : 0.4;
          })(),
          transition: 'all 0.2s ease',
        }}
      />
    </div>
  );
};
