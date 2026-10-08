import { ROOMS } from '../lib/rooms';

export default function RoomSelector({ activeRoom, onSelect }) {
  return (
    <nav aria-label="Rooms" className="flex gap-2 p-3 md:flex-col md:gap-1 md:p-4">
      <h2 className="sr-only">Rooms</h2>
      <p className="hidden px-2 pb-1 text-sm font-medium text-white/60 md:block">Rooms</p>
      {ROOMS.map((room) => {
        const active = room.id === activeRoom;
        return (
          <button
            key={room.id}
            type="button"
            data-testid={`room-${room.id}`}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(room.id)}
            className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:flex-none ${
              active ? 'bg-white text-ink' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <span aria-hidden="true" className={`text-sm ${active ? 'text-live' : 'text-white/40'}`}>
              {active ? '●' : '○'}
            </span>
            <span>
              <span className="block font-medium leading-tight">{room.label}</span>
              <span className={`hidden text-sm md:block ${active ? 'text-ink-soft' : 'text-white/50'}`}>
                {room.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
