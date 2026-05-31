import React, { useEffect, useRef, useState } from 'react';

interface StoryNovelSwitcherProps {
  novels: { id: string; title: string; mode: 'long' | 'short' }[];
  activeNovelId: string;
  onSwitchNovel: (id: string) => void;
  onCreateNovel: () => void;
  theme: {
    panel: string;
    text: string;
    textMuted: string;
    border: string;
    active: string;
  };
}

export const StoryNovelSwitcher: React.FC<StoryNovelSwitcherProps> = ({
  novels,
  activeNovelId,
  onSwitchNovel,
  onCreateNovel,
  theme,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeNovel = novels.find(novel => novel.id === activeNovelId);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSwitchNovel = (novelId: string) => {
    onSwitchNovel(novelId);
    setIsDropdownOpen(false);
  };

  const modeLabel = (mode: 'long' | 'short') =>
    mode === 'long' ? '长篇' : '短篇';

  return (
    <div ref={dropdownRef} className="relative">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        style={{
          backgroundColor: theme.panel,
          color: theme.text,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div className="flex items-center">
          <span>{activeNovel?.title || '未选择小说'}</span>
          <span className="ml-1 text-sm">▼</span>
        </div>
        <button
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={e => {
            e.stopPropagation();
            onCreateNovel();
          }}
          style={{
            color: theme.text,
          }}
        >
          ＋
        </button>
      </div>

      {isDropdownOpen && (
        <div
          className="absolute left-0 right-0 z-[100] mt-1 rounded shadow-lg"
          style={{
            backgroundColor: theme.panel,
            border: `1px solid ${theme.border}`,
          }}
        >
          {novels.length === 0 ? (
            <div
              className="px-3 py-2 text-center text-sm"
              style={{ color: theme.textMuted }}
            >
              还没有小说，点击 ＋ 创建
            </div>
          ) : (
            novels.map(novel => (
              <div
                key={novel.id}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between ${
                  novel.id === activeNovelId
                    ? 'font-medium'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => handleSwitchNovel(novel.id)}
                style={{
                  color: novel.id === activeNovelId ? theme.active : theme.text,
                }}
              >
                <span>{novel.title}</span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: theme.active,
                    color: theme.panel,
                  }}
                >
                  {modeLabel(novel.mode)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
