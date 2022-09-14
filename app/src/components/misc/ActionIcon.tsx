import { useRecoilValue } from 'recoil';
import { PoolAction } from '@jet-lab/margin';
import { CurrentAction } from '../../state/actions/actions';
import { ReactComponent as DepositIcon } from '../../styles/icons/function-deposit.svg';
import { ReactComponent as WithdrawIcon } from '../../styles/icons/function-withdraw.svg';
import { ReactComponent as BorrowIcon } from '../../styles/icons/function-borrow.svg';
import { ReactComponent as RepayIcon } from '../../styles/icons/function-repay.svg';
import { ReactComponent as SwapIcon } from '../../styles/icons/function-swap.svg';
import { ReactComponent as TransferIcon } from '../../styles/icons/function-transfer.svg';

// Return the correlated icon for a user action
export function ActionIcon(props: {
  action?: PoolAction;
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const currentAction = useRecoilValue(CurrentAction);
  const action = props.action ?? currentAction;

  switch (action) {
    case 'deposit':
      return <DepositIcon className={`jet-icon ${props.className ?? ''}`} style={props.style} />;
    case 'borrow':
      return <BorrowIcon className={`jet-icon ${props.className ?? ''}`} style={props.style} />;
    case 'withdraw':
      return <WithdrawIcon className={`jet-icon ${props.className ?? ''}`} style={props.style} />;
    case 'repay':
      return <RepayIcon className={`jet-icon ${props.className ?? ''}`} style={props.style} />;
    case 'swap':
      return <SwapIcon className={`jet-icon ${props.className ?? ''}`} style={props.style} />;
    case 'transfer':
      return <TransferIcon className={`jet-icon ${props.className ?? ''}`} style={props.style} />;
    default:
      return <></>;
  }
}