import { FC } from "react";

type Props = {
  address: string;  
  numbers: Array<number>;
  onSelect: (address: string) => void;
};

export const TicketCard: FC<Props> = ({
  address,  
  numbers,
  onSelect,
}) => {

  const drawing = numbers.join(' ');

  return (
    <div className={`card cursor-pointer bordered max-w-xs compact rounded-md`} onClick={() => onSelect(address)}>
      <figure className="min-h-16 animation-pulse-color">
          <div className="w-auto h-24 flex items-center justify-center bg-gray-900 bg-opacity-40">
            <span className="text-8xl">🎟️</span>
          </div>
      </figure>
      <div className="card-body">
        <h2 className="card-title text-sm text-center">{drawing}</h2>
      </div>
    </div>
  );
};