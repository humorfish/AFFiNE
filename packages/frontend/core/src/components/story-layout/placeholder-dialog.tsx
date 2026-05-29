import { Modal } from './modal';

interface PlaceholderDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function PlaceholderDialog({ open, title, onClose }: PlaceholderDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 36, opacity: 0.5 }}>🚧</span>
        <span style={{ color: '#8888aa', fontSize: 14 }}>
          {title}功能开发中
        </span>
        <span style={{ color: '#666688', fontSize: 12 }}>敬请期待</span>
      </div>
    </Modal>
  );
}