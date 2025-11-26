
import React, { useState, useRef } from 'react';
import { Tag, X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { InventoryItem } from '../types';
import { useClickOutside } from '../hooks';
import { Button, Card } from './UI';

export const ResourceRow = ({ item, onInvestigate }: { item: InventoryItem, onInvestigate: (item: InventoryItem) => void }) => {
  const [showTags, setShowTags] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const hasTags = Object.keys(item.tags).length > 0;

  useClickOutside(popupRef, () => setShowTags(false));

  return (
    <div className="p-4 hover:bg-[var(--bg-hover)]/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)]/50 last:border-0 theme-transition group">
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center space-x-2">
            <div className="relative" ref={popupRef}>
              <button 
                onClick={() => setShowTags(!showTags)}
                className={`font-mono font-medium truncate text-sm transition-colors border-b border-dashed inline-block pb-0.5 outline-none
                  ${showTags ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-main)] border-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]'}
                `}
              >
                {item.resourceId}
              </button>

              {/* Tag Popover (Click based) */}
              {showTags && (
                <div className="absolute left-0 top-full mt-2 z-[100] w-96 max-w-[85vw] animate-in fade-in slide-in-from-top-2">
                  <div className="bg-[var(--popup-bg)] border border-[var(--border)] rounded-lg shadow-2xl p-4 text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                      <div className="font-semibold text-[var(--text-main)] flex items-center">
                        <Tag className="w-3.5 h-3.5 mr-2 text-[var(--accent)]" /> 
                        Resource Tags
                      </div>
                      <button onClick={() => setShowTags(false)} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    {hasTags ? (
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {Object.entries(item.tags).map(([k, v]) => (
                          <div key={k} className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1">{k}</span>
                            <span className="text-[var(--text-main)] bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1.5 font-mono break-all leading-tight">
                              {v}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)] italic">No tags found for this resource.</span>
                    )}
                    <div className="absolute left-4 -top-1.5 w-3 h-3 bg-[var(--popup-bg)] border-t border-l border-[var(--border)] transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
            {hasTags && (
              <span className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-[10px] px-1.5 py-0.5 rounded flex items-center">
                <Tag className="w-3 h-3 mr-1" /> {Object.keys(item.tags).length}
              </span>
            )}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center space-x-3">
            <span className="bg-[var(--bg-card)] px-2 py-0.5 rounded border border-[var(--border)]">
                Type: {item.resourceType}
            </span>
            <span className="hidden md:inline text-[10px] truncate max-w-[200px] opacity-70">{item.arn}</span>
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
         <Button 
            variant="secondary" 
            size="sm" 
            icon={Search} 
            onClick={() => onInvestigate(item)}
            className="shadow-sm border border-[var(--border)]"
         >
           CloudTrail Logs
         </Button>
      </div>
    </div>
  );
};

export const ServiceGroup = ({ service, items, onInvestigate }: { service: string, items: InventoryItem[], onInvestigate: (item: InventoryItem) => void }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="p-0 border-t-4 border-t-[var(--accent)] mb-4 transition-all duration-200">
      <div 
        className="bg-[var(--bg-card)]/80 p-4 border-b border-[var(--border)] flex justify-between items-center cursor-pointer hover:bg-[var(--bg-hover)]/50 transition-colors select-none rounded-t-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
            <button className="text-[var(--text-muted)] p-1 hover:text-[var(--text-main)] transition-colors">
              {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </button>
            <div className="bg-[var(--bg-hover)] p-2 rounded text-[var(--text-muted)] uppercase font-bold text-xs tracking-wider">
              {service}
            </div>
            <span className="text-[var(--text-muted)] text-sm">
                <span className="text-[var(--text-main)] font-bold mr-1">{items.length}</span> 
                resources
            </span>
        </div>
      </div>
      {isOpen && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          {items.map((item, idx) => (
             <ResourceRow key={idx} item={item} onInvestigate={onInvestigate} />
          ))}
        </div>
      )}
    </Card>
  );
};
