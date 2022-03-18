import { FC } from "react";

type Props = {
  address: string;
  numbers: Array<number>;
  onSelect: (addr: string) => void;
};

export const TicketCard: FC<Props> = ({ address, numbers, onSelect }) => {
  console.log(address);
  const drawing = numbers.join(" ");
  return (
    <div
      className={`card max-w-xs compact rounded-md`}
      onClick={() => onSelect(address)}
    >
      <label title="Redeem Ticket">
        <figure className="cursor-pointer min-h-16 animation-pulse-color">
          <div className="w-auto h-24 flex items-center justify-center bg-gray-900 bg-opacity-40">
            <span className="text-8xl">🎟️</span>
          </div>
        </figure>
        <div className="card-body">
          <h2 className="card-title text-sm text-center">{drawing}</h2>
          <h2 className="text-xs text-center">{address.substring(0, 10)}...</h2>
        </div>
      </label>
    </div>
  );
};
