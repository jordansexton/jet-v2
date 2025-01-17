import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { CurrentAccount } from '../../state/user/accounts';
import { Geobanned } from '../../state/settings/localization/localization';
import {
  WalletModal as WalletModalState,
  NewAccountModal as NewAccountModalState,
  SettingsModal as SettingsModalState,
  NotificationsModal as NotificationsModalState
} from '../../state/modals/modals';
import { CurrentAction } from '../../state/actions/actions';
import { GeobannedModal } from './GeobannedModal';
import { DisclaimerModal } from './DisclaimerModal';
import { WalletModal } from './WalletModal';
import { DepositWithdrawModal } from './actions/DepositWithdrawModal';
import { BorrowRepayModal } from './actions/BorrowRepayModal';
import { TransferModal } from './actions/TransferModal';
import { NewAccountModal } from './NewAccountModal';
import { SettingsModal } from './SettingsModal';
import { NotificationsModal } from './NotificationsModal';

// Wrapper component to include all app modals
export function Modals(): JSX.Element {
  const currentAccount = useRecoilValue(CurrentAccount);
  const geobanned = useRecoilValue(Geobanned);
  const WalletModalOpen = useRecoilValue(WalletModalState);
  const currentAction = useRecoilValue(CurrentAction);
  const newAccountModalOpen = useRecoilValue(NewAccountModalState);
  // const editAccountModalOpen = useRecoilValue(EditAccountModalState);
  const settingsModalOpen = useRecoilValue(SettingsModalState);
  const notificationsModalOpen = useRecoilValue(NotificationsModalState);

  // Disable scroll when these modals are open
  useEffect(() => {
    if (
      geobanned ||
      WalletModalOpen ||
      currentAction ||
      newAccountModalOpen ||
      // editAccountModalOpen ||
      settingsModalOpen ||
      notificationsModalOpen
    ) {
      document.body.style.overflowY = 'hidden';
    } else {
      document.body.style.overflowY = 'unset';
    }
  }, [
    geobanned,
    WalletModalOpen,
    currentAction,
    newAccountModalOpen,
    // editAccountModalOpen,
    settingsModalOpen,
    notificationsModalOpen
  ]);

  return (
    <>
      <GeobannedModal />
      <DisclaimerModal />
      <WalletModal />
      <DepositWithdrawModal />
      <BorrowRepayModal />
      <TransferModal />
      <NewAccountModal />
      {/* <EditAccountModal /> */}
      <SettingsModal />
      <NotificationsModal />
    </>
  );
}
