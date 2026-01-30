import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Calendar as CalendarIcon, 
  Plus, 
  GripVertical, 
  X,
  ChevronLeft as BackIcon,
  Maximize2,
  Minimize2,
  Trash2,
  AlignJustify,
  ArrowUpCircle,
  Heart,
  Clock,
  Timer
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  addDays,
  subDays,
  startOfDay,
  differenceInCalendarDays,
  isFuture,
  isPast
} from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Note = {
  id: string;
  date: Date;
  text: string;
  order: number;
  isFavorite: boolean;
};

type ViewState = 'calendar' | 'editor' | 'search' | 'feed' | 'countdowns';

// --- Mock Data ---
const TODAY = new Date();
const MOCK_NOTES: Note[] = [
  { id: '1', date: TODAY, text: "Felt the sun on my face today. It was a gentle reminder that winter doesn't last forever.", order: 0, isFavorite: true },
  { id: '2', date: TODAY, text: "Quiet coffee morning. The steam rising looks like dancing ghosts.", order: 1, isFavorite: false },
  { id: '3', date: subMonths(TODAY, 1), text: "Reviewed my goals for the year. Keeping it simple.", order: 0, isFavorite: true },
  { id: '4', date: subDays(TODAY, 2), text: "Rainy mood. Reading a book by the window.", order: 0, isFavorite: false },
  { id: '5', date: subDays(TODAY, 5), text: "Long walk in the park. The trees are starting to bloom.", order: 0, isFavorite: false },
  { id: '6', date: addDays(TODAY, 10), text: "Trip to the mountains! Can't wait.", order: 0, isFavorite: true }, // Future note
];

// --- Components ---

const DraggableNoteCard = ({ 
  note, 
  index, 
  moveNote, 
  onEdit,
  readOnly = false
}: { 
  note: Note, 
  index: number, 
  moveNote?: (dragIndex: number, hoverIndex: number) => void,
  onEdit: (note: Note) => void,
  readOnly?: boolean
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop({
    accept: 'note',
    canDrop: () => !readOnly,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      };
    },
    hover(item: { index: number }, monitor) {
      if (readOnly || !ref.current || !moveNote) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      if (dragIndex === hoverIndex) {
        return;
      }

      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = (clientOffset as any).y - hoverBoundingRect.top;

      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      moveNote(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: 'note',
    canDrag: () => !readOnly,
    item: () => {
      return { id: note.id, index };
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  if (!readOnly) {
    drag(drop(ref));
  }

  return (
    <div 
      ref={ref}
      onClick={() => onEdit(note)}
      data-handler-id={readOnly ? undefined : handlerId}
      className={cn(
        "group bg-white rounded-xl p-5 shadow-sm border border-[#F0EFE9] active:scale-[0.98] transition-all flex items-start gap-3 cursor-pointer mb-4 relative",
        isDragging ? "opacity-40" : "opacity-100"
      )}
    >
      {!readOnly && (
        <div className="text-[#D1D1D1] mt-1 cursor-grab active:cursor-grabbing hover:text-[#8A9A8D]">
          <GripVertical size={16} />
        </div>
      )}
      <div className="w-full">
        {readOnly && (
           <div className="text-[10px] font-bold text-[#8A9A8D] mb-2 uppercase tracking-wider flex justify-between">
               <span>{format(note.date, 'EEEE, MMM d')}</span>
               {note.isFavorite && <Heart size={12} className="text-[#E57373] fill-current" />}
           </div>
        )}
        <p className="text-[#2D2D2D] text-base leading-relaxed line-clamp-3 w-full">
            {note.text || <span className="text-gray-300 italic">Empty note</span>}
        </p>
        {!readOnly && note.isFavorite && (
             <div className="absolute top-5 right-5 text-[#E57373]">
                 <Heart size={14} className="fill-current" />
             </div>
        )}
      </div>
    </div>
  );
};

// --- Views ---

const CalendarView = ({ 
  notes, 
  selectedDate,
  onSelectDate, 
  onGoToSearch,
  onEditNote,
  onCreateNote,
  onMoveNote
}: { 
  notes: Note[], 
  selectedDate: Date,
  onSelectDate: (date: Date) => void,
  onGoToSearch: () => void,
  onEditNote: (note: Note) => void,
  onCreateNote: () => void,
  onMoveNote: (dragIndex: number, hoverIndex: number, date: Date) => void
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isFullScreen, setIsFullScreen] = useState(false);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonth]);

  const hasNote = (date: Date) => {
    return notes.some(note => isSameDay(note.date, date));
  };

  const dayNotes = notes
    .filter(n => isSameDay(n.date, selectedDate))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full bg-[#FDFCF8]">
      {/* Calendar Section - Hidden when full screen */}
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden",
        isFullScreen ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
      )}>
        <header className="px-6 pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 text-[#8E8E8E] hover:text-[#2D2D2D]">
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-semibold text-[#2D2D2D] w-32 text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </h1>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 text-[#8E8E8E] hover:text-[#2D2D2D]">
              <ChevronRight size={20} />
            </button>
          </div>
          <button 
            onClick={() => {
              setCurrentMonth(new Date());
              onSelectDate(new Date());
            }}
            className="text-sm font-medium text-[#8A9A8D] hover:text-[#7A8B7D]"
          >
            Today
          </button>
        </header>

        <div className="px-4 pb-6 border-b border-[#F0EFE9]">
          <div className="grid grid-cols-7 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={`${day}-${i}`} className="text-center text-xs text-[#8E8E8E] font-medium py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-2">
            {days.map((day) => {
              const isSelectedMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);
              const isSelected = isSameDay(day, selectedDate);
              const hasNotes = hasNote(day);

              return (
                <div key={day.toString()} className="flex flex-col items-center justify-start h-10">
                  <button
                    onClick={() => {
                      onSelectDate(day);
                      if (!isSameMonth(day, currentMonth)) {
                        setCurrentMonth(day);
                      }
                    }}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all duration-200 relative",
                      !isSelectedMonth && "text-[#D1D1D1]",
                      isSelectedMonth && "text-[#2D2D2D]",
                      isTodayDate && !isSelected && "bg-[#EBE9E4] font-semibold",
                      isSelected && "bg-[#2D2D2D] text-[#FDFCF8] font-semibold shadow-md",
                      !isTodayDate && !isSelected && isSelectedMonth && "hover:bg-[#F5F5F0]"
                    )}
                  >
                    {format(day, 'd')}
                    {hasNotes && !isSelected && (
                      <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-[#8A9A8D]" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notes List Section - Expands to fill */}
      <div className="flex-1 flex flex-col bg-[#FDFCF8] min-h-0 relative z-0">
        <div className={cn(
            "px-6 flex items-center justify-between bg-[#FDFCF8] z-10 border-b border-transparent transition-all duration-300",
            isFullScreen ? "pt-12 pb-4" : "py-4"
        )}>
            <div className="flex items-center gap-3">
               {isFullScreen && (
                   <button onClick={() => setIsFullScreen(false)} className="text-[#8E8E8E] hover:text-[#2D2D2D]">
                       <BackIcon size={20} />
                   </button>
               )}
               <h2 className="text-lg font-semibold text-[#2D2D2D]">
                {format(selectedDate, 'EEEE, MMM d')}
               </h2>
            </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 text-[#8E8E8E] hover:text-[#2D2D2D] hover:bg-[#EBE9E4] rounded-full transition-colors"
              title={isFullScreen ? "Show Calendar" : "Full Screen"}
            >
              {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button 
              onClick={onCreateNote} 
              className="p-2 bg-[#2D2D2D] text-[#FDFCF8] rounded-full shadow-sm hover:bg-black transition-transform active:scale-95"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 pb-24">
          {dayNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-[#8E8E8E] italic">
              <p>No notes for this day.</p>
              <p className="text-sm mt-2">Tap + to add one.</p>
            </div>
          ) : (
            dayNotes.map((note, index) => (
              <DraggableNoteCard
                key={note.id}
                index={index}
                note={note}
                moveNote={(dragIndex, hoverIndex) => onMoveNote(dragIndex, hoverIndex, selectedDate)}
                onEdit={onEditNote}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const NoteEditorScreen = ({ 
  note, 
  onSave,
  onDelete,
  onClose,
  isNew,
  onToggleFavorite
}: { 
  note: Note | null, 
  onSave: (text: string) => void, 
  onDelete: () => void,
  onClose: () => void,
  isNew: boolean,
  onToggleFavorite: () => void
}) => {
  const [text, setText] = useState(note?.text || '');

  return (
    <div className="flex flex-col h-full bg-[#FDFCF8]">
      <header className="px-6 pt-12 pb-2 flex items-center justify-between">
        <div className="flex gap-2">
            <button onClick={onClose} className="p-2 -ml-2 text-[#8E8E8E] hover:text-[#2D2D2D]">
            <X size={24} />
            </button>
        </div>
        
        <div className="flex items-center gap-2">
            {!isNew && (
                <>
                <button
                    onClick={onToggleFavorite}
                    className={cn(
                        "p-2 rounded-full transition-colors",
                        note?.isFavorite ? "text-[#E57373] bg-[#FFF0F0]" : "text-[#8E8E8E] hover:bg-[#EBE9E4]"
                    )}
                    title="Favorite"
                >
                    <Heart size={20} className={cn(note?.isFavorite && "fill-current")} />
                </button>
                <button 
                    onClick={() => {
                        if (confirm('Are you sure you want to delete this note?')) {
                            onDelete();
                        }
                    }}
                    className="p-2 text-[#8E8E8E] hover:text-[#E57373] hover:bg-[#FFF0F0] rounded-full transition-colors"
                    title="Delete Note"
                >
                    <Trash2 size={20} />
                </button>
                </>
            )}
            <button 
            onClick={() => {
                onSave(text);
                onClose();
            }} 
            className="ml-2 px-4 py-2 bg-[#2D2D2D] text-[#FDFCF8] rounded-full font-medium text-sm shadow-sm hover:bg-black transition-colors"
            >
            Done
            </button>
        </div>
      </header>

      <div className="flex-1 px-6 py-4">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isNew ? "What did you notice today?" : ""}
          className="w-full h-full bg-transparent resize-none outline-none text-lg text-[#2D2D2D] leading-relaxed placeholder:text-[#D1D1D1] font-normal"
        />
      </div>
    </div>
  );
};

const SearchScreen = ({ 
  notes, 
  onSelectNote,
  onClose
}: { 
  notes: Note[], 
  onSelectNote: (note: Note) => void,
  onClose: () => void
}) => {
  const [query, setQuery] = useState('');

  const filteredNotes = useMemo(() => {
    if (!query.trim()) return [];
    return notes
      .filter(n => n.text.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [query, notes]);

  return (
    <div className="flex flex-col h-full bg-[#FDFCF8]">
      <div className="px-6 pt-12 pb-4 flex items-center gap-4">
        <button onClick={onClose} className="p-2 -ml-2 text-[#8E8E8E] hover:text-[#2D2D2D]">
            <BackIcon size={24} />
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E8E8E]" size={18} />
          <input
            type="text"
            autoFocus
            placeholder="Search your notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#EBE9E4]/50 rounded-xl py-3 pl-10 pr-4 text-[#2D2D2D] placeholder:text-[#8E8E8E] outline-none focus:bg-[#EBE9E4] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-20">
        {query && filteredNotes.length === 0 && (
          <p className="text-center text-[#8E8E8E] mt-8">No matching notes found.</p>
        )}
        
        <div className="space-y-6 pt-4">
          {filteredNotes.map(note => (
            <button 
              key={note.id}
              onClick={() => onSelectNote(note)}
              className="w-full text-left group"
            >
              <div className="text-xs font-semibold text-[#8A9A8D] mb-1 uppercase tracking-wide">
                {format(note.date, 'MMMM d, yyyy')}
              </div>
              <p className="text-[#2D2D2D] text-base leading-relaxed line-clamp-2 border-l-2 border-[#EBE9E4] pl-3 group-hover:border-[#8A9A8D] transition-colors">
                {note.text}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const FeedScreen = ({ 
    notes, 
    onSelectNote,
    onReturnHome
  }: { 
    notes: Note[], 
    onSelectNote: (note: Note) => void,
    onReturnHome: () => void
  }) => {
    const todayRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
  
    // Sort notes chronologically
    const sortedNotes = useMemo(() => {
      return [...notes].sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [notes]);
  
    // Group notes by day
    const groupedData = useMemo(() => {
       const groups: { date: Date, notes: Note[] }[] = [];
       const dateMap = new Map<string, Note[]>();
       
       sortedNotes.forEach(note => {
           const key = startOfDay(note.date).toISOString();
           if (!dateMap.has(key)) {
               dateMap.set(key, []);
           }
           dateMap.get(key)?.push(note);
       });
       
       // Ensure Today exists
       const todayKey = startOfDay(new Date()).toISOString();
       if (!dateMap.has(todayKey)) {
           dateMap.set(todayKey, []);
       }
       
       Array.from(dateMap.keys()).sort().forEach(key => {
           groups.push({
               date: new Date(key),
               notes: dateMap.get(key) || []
           });
       });
       
       return groups;
    }, [sortedNotes]);
  
    useEffect(() => {
        if (todayRef.current) {
            todayRef.current.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
    }, []);

    const handleReturnToToday = () => {
        if (todayRef.current) {
            todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };
  
    return (
      <div className="flex flex-col h-full bg-[#FDFCF8] relative">
        <header className="px-6 pt-12 pb-4 bg-[#FDFCF8]/90 backdrop-blur-sm sticky top-0 z-20 border-b border-[#F0EFE9]">
           <h1 className="text-xl font-semibold text-[#2D2D2D]">Feed</h1>
        </header>
  
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 pb-24 pt-4">
           {groupedData.map((group, i) => {
               const isTodayGroup = isToday(group.date);
               return (
                   <div 
                      key={group.date.toISOString()} 
                      ref={isTodayGroup ? todayRef : null}
                      className="mb-8"
                   >
                       <div className="flex items-center gap-2 mb-4">
                           <div className={cn(
                               "text-sm font-bold uppercase tracking-wider",
                               isTodayGroup ? "text-[#2D2D2D]" : "text-[#8A9A8D]"
                           )}>
                               {isTodayGroup ? "Today" : format(group.date, 'EEEE, MMMM d')}
                           </div>
                           {isTodayGroup && <div className="h-1.5 w-1.5 rounded-full bg-[#8A9A8D]" />}
                       </div>

                       {group.notes.length === 0 && isTodayGroup ? (
                           <div className="p-8 text-center text-[#8E8E8E] bg-[#F5F5F0] rounded-xl border border-dashed border-[#D1D1D1]">
                               No notes for today yet.
                           </div>
                       ) : (
                           group.notes.map((note, idx) => (
                               <DraggableNoteCard
                                  key={note.id}
                                  index={idx} 
                                  note={note}
                                  onEdit={onSelectNote}
                                  readOnly={true}
                               />
                           ))
                       )}
                   </div>
               );
           })}
        </div>

        <div className="absolute bottom-24 right-6 z-30">
            <button 
                onClick={handleReturnToToday}
                className="bg-[#2D2D2D] text-white p-3 rounded-full shadow-lg hover:bg-black transition-transform active:scale-95 flex items-center gap-2 pr-4"
            >
                <ArrowUpCircle size={20} />
                <span className="text-xs font-bold">Today</span>
            </button>
        </div>
      </div>
    );
  };

const CountdownsScreen = ({ 
    notes, 
    onSelectNote 
  }: { 
    notes: Note[], 
    onSelectNote: (note: Note) => void 
  }) => {
    // Filter favorites and sort by date descending (Newest first)
    // As per request: "most recent at the top (todays)"
    const favoriteNotes = useMemo(() => {
        return notes
            .filter(n => n.isFavorite)
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [notes]);
  
    return (
      <div className="flex flex-col h-full bg-[#FDFCF8]">
        <header className="px-6 pt-12 pb-4 bg-[#FDFCF8] sticky top-0 z-20 border-b border-[#F0EFE9]">
           <h1 className="text-xl font-semibold text-[#2D2D2D]">Countdowns</h1>
           <p className="text-sm text-[#8E8E8E] mt-1">Days since your favorite moments</p>
        </header>
  
        <div className="flex-1 overflow-y-auto px-6 pb-24 pt-6 space-y-4">
          {favoriteNotes.length === 0 && (
             <div className="flex flex-col items-center justify-center h-64 text-[#8E8E8E] text-center p-8">
                 <Heart size={48} strokeWidth={1} className="mb-4 text-[#D1D1D1]" />
                 <p>No favorite notes yet.</p>
                 <p className="text-sm mt-2">Tap the heart icon on a note to add it here.</p>
             </div>
          )}

          {favoriteNotes.map(note => {
              const diff = differenceInCalendarDays(new Date(), note.date);
              // diff > 0 means note is in past (Days Ago)
              // diff < 0 means note is in future (Days Until)
              // diff = 0 means Today
              
              let count = Math.abs(diff);
              let label = "";
              
              if (diff === 0) {
                  label = "Today";
              } else if (diff > 0) {
                  label = "Days Ago";
              } else {
                  label = "Days Until";
              }

              return (
                  <button 
                     key={note.id}
                     onClick={() => onSelectNote(note)}
                     className="w-full bg-white rounded-xl p-6 shadow-sm border border-[#F0EFE9] flex items-center gap-6 group hover:border-[#8A9A8D] transition-colors"
                  >
                     <div className="flex flex-col items-center justify-center min-w-[80px]">
                         {diff === 0 ? (
                            <span className="text-lg font-bold text-[#8A9A8D]">Now</span>
                         ) : (
                             <>
                                <span className="text-4xl font-light text-[#2D2D2D]">{count}</span>
                                <span className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-wider">{label}</span>
                             </>
                         )}
                     </div>
                     <div className="h-12 w-px bg-[#F0EFE9]" />
                     <div className="flex-1 text-left overflow-hidden">
                         <div className="text-xs font-semibold text-[#8A9A8D] mb-1 uppercase tracking-wide">
                             {format(note.date, 'MMMM d, yyyy')}
                         </div>
                         <p className="text-[#2D2D2D] text-sm leading-relaxed line-clamp-2">
                             {note.text}
                         </p>
                     </div>
                  </button>
              );
          })}
        </div>
      </div>
    );
  };

// --- Main App Component ---

export default function App() {
  const [view, setView] = useState<ViewState>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>(MOCK_NOTES);

  // Navigation Handlers
  const navigateToEditor = (noteId: string | null = null) => {
    setActiveNoteId(noteId);
    setView('editor');
  };

  const handleSaveNote = (text: string) => {
    if (activeNoteId) {
      // Update existing
      setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, text } : n));
    } else {
      // Create new
      const newNote: Note = {
        id: Math.random().toString(36).substr(2, 9),
        date: selectedDate,
        text,
        order: notes.filter(n => isSameDay(n.date, selectedDate)).length,
        isFavorite: false
      };
      setNotes(prev => [...prev, newNote]);
    }
  };

  const handleToggleFavorite = () => {
      if (activeNoteId) {
          setNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, isFavorite: !n.isFavorite } : n));
      }
  };

  const handleDeleteNote = () => {
      if (activeNoteId) {
          setNotes(prev => prev.filter(n => n.id !== activeNoteId));
          // Intelligent back navigation
          if (view === 'countdowns') {
             setView('countdowns'); // Stay there
          } else {
             setView('calendar');
          }
          setActiveNoteId(null);
      }
  };

  const moveNote = useCallback((dragIndex: number, hoverIndex: number, date: Date) => {
    setNotes((prevNotes) => {
        const dayNotes = prevNotes
            .filter(n => isSameDay(n.date, date))
            .sort((a, b) => a.order - b.order);
        
        const movedNote = dayNotes[dragIndex];
        
        const remainingDayNotes = [...dayNotes];
        remainingDayNotes.splice(dragIndex, 1);
        remainingDayNotes.splice(hoverIndex, 0, movedNote);

        const updatedDayNotes = remainingDayNotes.map((note, index) => ({
            ...note,
            order: index
        }));

        const otherNotes = prevNotes.filter(n => !isSameDay(n.date, date));
        return [...otherNotes, ...updatedDayNotes];
    });
  }, []);

  // Render logic
  const renderContent = () => {
    switch (view) {
      case 'editor':
        return (
          <NoteEditorScreen 
            note={activeNoteId ? notes.find(n => n.id === activeNoteId) || null : null}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
            onToggleFavorite={handleToggleFavorite}
            onClose={() => {
                // If we were editing a note from a specific view, we might want to return there.
                // But for now, we rely on the state of 'view' which we should probably not overwrite 
                // when entering editor if we want to return.
                // However, our current structure sets view='editor', overwriting previous view.
                // A simple fix for this simple app: Default back to calendar, unless we have a history stack.
                // Let's just default to Calendar for now as it's the home base. 
                // Or better, let's keep a "lastView" state, but for simplicity:
                setView('calendar'); 
            }} 
            isNew={!activeNoteId}
          />
        );
      case 'search':
        return (
          <SearchScreen 
            notes={notes}
            onSelectNote={(note) => {
              setSelectedDate(note.date);
              setActiveNoteId(note.id);
              setView('editor');
            }}
            onClose={() => setView('calendar')}
          />
        );
      case 'feed':
          return (
            <FeedScreen 
                notes={notes}
                onSelectNote={(note) => {
                    setSelectedDate(note.date);
                    setActiveNoteId(note.id);
                    setView('editor');
                }}
                onReturnHome={() => setView('calendar')}
            />
          );
      case 'countdowns':
          return (
             <CountdownsScreen 
                notes={notes}
                onSelectNote={(note) => {
                    setSelectedDate(note.date);
                    setActiveNoteId(note.id);
                    setView('editor');
                }}
             />
          );
      case 'calendar':
      default:
        return (
          <CalendarView 
            notes={notes}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onGoToSearch={() => setView('search')}
            onEditNote={(note) => navigateToEditor(note.id)}
            onCreateNote={() => navigateToEditor(null)}
            onMoveNote={moveNote}
          />
        );
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="w-full h-screen flex items-center justify-center bg-[#1C1C1E] font-sans antialiased text-[#2D2D2D]">
        {/* Mobile Frame Simulation */}
        <div className="w-full h-full sm:max-w-[400px] sm:h-[850px] sm:rounded-[40px] bg-[#FDFCF8] relative overflow-hidden shadow-2xl flex flex-col">
          
          <div className="h-0 sm:h-8 w-full bg-[#FDFCF8] shrink-0" />

          <main className="flex-1 relative overflow-hidden flex flex-col">
            {renderContent()}
          </main>

          {/* Bottom Tab Bar */}
          {view !== 'editor' && (
            <nav className="absolute bottom-0 left-0 right-0 h-20 bg-[#FDFCF8]/90 backdrop-blur-md border-t border-[#F0EFE9] flex items-start justify-around pt-4 pb-8 z-20">
              <button 
                onClick={() => setView('calendar')}
                className={cn(
                  "flex flex-col items-center gap-1 w-16 transition-colors",
                  view === 'calendar' ? "text-[#2D2D2D]" : "text-[#8E8E8E] hover:text-[#5A5A5A]"
                )}
              >
                <CalendarIcon size={24} strokeWidth={view === 'calendar' ? 2.5 : 2} />
                <span className="text-[10px] font-medium">Journal</span>
              </button>
              
              <button 
                onClick={() => setView('feed')}
                className={cn(
                  "flex flex-col items-center gap-1 w-16 transition-colors",
                  view === 'feed' ? "text-[#2D2D2D]" : "text-[#8E8E8E] hover:text-[#5A5A5A]"
                )}
              >
                <AlignJustify size={24} strokeWidth={view === 'feed' ? 2.5 : 2} />
                <span className="text-[10px] font-medium">Feed</span>
              </button>

              <button 
                onClick={() => setView('countdowns')}
                className={cn(
                  "flex flex-col items-center gap-1 w-16 transition-colors",
                  view === 'countdowns' ? "text-[#2D2D2D]" : "text-[#8E8E8E] hover:text-[#5A5A5A]"
                )}
              >
                <Timer size={24} strokeWidth={view === 'countdowns' ? 2.5 : 2} />
                <span className="text-[10px] font-medium">Countdowns</span>
              </button>

              <button 
                onClick={() => setView('search')}
                className={cn(
                  "flex flex-col items-center gap-1 w-16 transition-colors",
                  view === 'search' ? "text-[#2D2D2D]" : "text-[#8E8E8E] hover:text-[#5A5A5A]"
                )}
              >
                <Search size={24} strokeWidth={view === 'search' ? 2.5 : 2} />
                <span className="text-[10px] font-medium">Search</span>
              </button>
            </nav>
          )}

          {/* Home Indicator Spacer */}
          <div className="h-6 w-full bg-transparent shrink-0 pointer-events-none" />
        </div>
      </div>
    </DndProvider>
  );
}
