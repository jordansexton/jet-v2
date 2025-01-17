import * as anchor from '@project-serum/anchor';
import { AnchorProvider, BN } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import {
  MarginAccount,
  MarginClient,
  MarginCluster,
  MarginConfig,
  MarginPrograms,
  Pool,
  PoolTokenChange,
  PoolManager
} from '@jet-lab/margin';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import {
  Account,
  Connection,
  ConfirmOptions,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction
} from '@solana/web3.js';
import assert from 'assert';
import * as fs from 'fs';

import { airdropTokens } from './tokenFaucet';

const ZERO_BN = new BN(0);

export class Replicant {
  account: Account;
  cluster: MarginCluster;
  config: any;
  connection: Connection;
  keyfile: string;
  marginConfig: MarginConfig;
  poolManager: PoolManager;
  pools?: Pool[];
  programs: MarginPrograms;
  provider: AnchorProvider;
  faucetProgramId: PublicKey;

  constructor(
    config: any,
    marginConfig: MarginConfig,
    keyfile: string,
    cluster: MarginCluster,
    connection: Connection
  ) {
    this.account = new Account(
      Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyfile).toString()))).secretKey
    );
    this.cluster = cluster;
    this.config = config;
    this.connection = connection;
    this.keyfile = keyfile;

    this.marginConfig = marginConfig;

    const confirmOptions: ConfirmOptions = { skipPreflight: true, commitment: 'processed' };
    // @ts-ignore
    this.provider = new AnchorProvider(this.connection, new NodeWallet(this.account), confirmOptions);
    anchor.setProvider(this.provider);

    this.programs = MarginClient.getPrograms(this.provider, this.marginConfig);
    this.poolManager = new PoolManager(this.programs, this.provider);

    assert(this.marginConfig.faucetProgramId);
    this.faucetProgramId = new PublicKey(this.marginConfig.faucetProgramId);
  }

  static async create(
    config: any,
    marginConfig: MarginConfig,
    keyfile: string,
    cluster: MarginCluster,
    connection: Connection
  ): Promise<Replicant> {
    if (!fs.existsSync(keyfile)) {
      const keypair = Keypair.generate();
      fs.writeFileSync(keyfile, JSON.stringify(Array.from(keypair.secretKey)));
      const airdropSignature = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(airdropSignature);
      await sleep(4 * 1000);
    }

    return new Replicant(config, marginConfig, keyfile, cluster, connection);
  }

  async fundUser(): Promise<void> {
    const tokenAccounts = {};
    for (const account of this.config.accounts) {
      for (const token of Object.keys(account.tokens)) {
        if (!tokenAccounts[token]) {
          const tokenConfig = this.marginConfig.tokens[token];
          const tokenAccount: PublicKey = await getAssociatedTokenAddress(
            new PublicKey(tokenConfig.mint),
            this.account.publicKey
          );
          if (!(await this.connection.getAccountInfo(tokenAccount))) {
            await sendAndConfirmTransaction(
              this.connection,
              new Transaction().add(
                createAssociatedTokenAccountInstruction(
                  this.account.publicKey,
                  tokenAccount,
                  this.account.publicKey,
                  new PublicKey(tokenConfig.mint)
                )
              ),
              [this.account]
            );
          }
          tokenAccounts[token] = tokenAccount;
        }
      }
    }
  }

  async loadPools(): Promise<void> {
    this.pools = Object.values<Pool>(await this.poolManager.loadAll(this.programs));
  }

  async createAccounts(): Promise<void> {
    for (const account of this.config.accounts) {
      assert(account.name);
      assert(account.seed != undefined);
      assert(account.tokens);

      //console.log(`user.name = ${user.name}`)

      const marginAccount: MarginAccount = await MarginAccount.load({
        programs: this.programs,
        provider: this.provider,
        owner: this.account.publicKey,
        seed: account.seed
      });
      const accountInfo = await this.connection.getAccountInfo(marginAccount.address);
      if (!accountInfo) {
        //console.log(`createAccount`)
        await marginAccount.createAccount();
        await marginAccount.refresh();
      } else {
        await closeEmptyPositions(marginAccount);
      }
    }
  }

  async processDeposits(): Promise<void> {
    for (const account of this.config.accounts) {
      const marginAccount: MarginAccount = await MarginAccount.load({
        programs: this.programs,
        provider: this.provider,
        owner: this.account.publicKey,
        seed: account.seed
      });

      for (const tokenConfig of Object.values<any>(this.marginConfig.tokens)) {
        const token = account.tokens[tokenConfig.symbol];
        let expectedDeposit = ZERO_BN;
        if (token && token.deposit && token.deposit != 0) {
          expectedDeposit = new BN(token.deposit * 10 ** tokenConfig.decimals);
        }

        if (!expectedDeposit.eq(ZERO_BN)) {
          let existingDeposit = ZERO_BN;

          let marginPool: Pool = await this.poolManager.load({
            tokenMint: tokenConfig.mint,
            tokenConfig,
            programs: this.programs
          });

          await marginPool.refresh();

          const position = await marginAccount.getPosition(marginPool.addresses.depositNoteMint);
          if (position) {
            existingDeposit = position.balance;
          }

          if (existingDeposit.eq(ZERO_BN)) {
            assert(tokenConfig.decimals);
            assert(tokenConfig.faucet);
            const tokenAccount: PublicKey = await getAssociatedTokenAddress(
              new PublicKey(tokenConfig.mint),
              this.account.publicKey,
              true
            );
            //console.log(`DEPOSIT ${poolConfig.symbol} = ${expectedDeposit} | ${existingDeposit}`)
            const amount = expectedDeposit.sub(existingDeposit);

            await airdropTokens(
              this.connection,
              this.faucetProgramId,
              // @ts-ignore
              this.account,
              new PublicKey(tokenConfig.faucet),
              tokenAccount,
              amount
            );
            const txid = await marginPool.deposit({
              marginAccount,
              source: tokenAccount,
              change: PoolTokenChange.shiftBy(amount)
            });
          }
        }
      }
    }
  }

  async processBorrows(): Promise<void> {
    for (const account of this.config.accounts) {
      const marginAccount: MarginAccount = await MarginAccount.load({
        programs: this.programs,
        provider: this.provider,
        owner: this.account.publicKey,
        seed: account.seed
      });

      for (const tokenConfig of Object.values(this.marginConfig.tokens)) {
        const token = account.tokens[tokenConfig.symbol];
        let expectedBorrow = ZERO_BN;
        if (token && token.borrow) {
          expectedBorrow = new BN(token.borrow * 10 ** tokenConfig.decimals);
        }

        const tokenMultiplier = new BN(10 ** tokenConfig.decimals);

        let marginPool: Pool = await this.poolManager.load({
          tokenMint: new PublicKey(tokenConfig.mint),
          tokenConfig,
          programs: this.programs
        });

        let existingBorrow = ZERO_BN;

        if (marginAccount.info) {
          for (let i = 0; i < marginAccount.info.positions.length.toNumber(); i++) {
            const position = marginAccount.info.positions.positions[i];
            if (position.token.equals(marginPool.addresses.loanNoteMint)) {
              existingBorrow = position.balance;
              break;
            }
          }
        }

        if (!expectedBorrow.eq(ZERO_BN) || !existingBorrow.eq(ZERO_BN)) {
          //console.log(`BORROW ${poolConfig.symbol} = ${expectedBorrow} | ${existingBorrow}`)
          assert(tokenConfig.decimals);
          assert(tokenConfig.faucet);
          if (existingBorrow.lt(expectedBorrow)) {
            const amount = expectedBorrow.sub(existingBorrow);
            await marginPool.marginBorrow({
              marginAccount,
              pools: this.pools!,
              change: PoolTokenChange.shiftBy(amount)
            });
          } else if (existingBorrow.gt(expectedBorrow)) {
            const amount = existingBorrow.sub(expectedBorrow);

            //TODO this needs to be tested.
            console.log(`amount = ${amount}`);
            assert(false);
            //await marginPool.marginWithdraw({ marginAccount, destination: tokenAccount, amount: PoolAmount.tokens(amount) });
          }
        }
      }
    }
  }

  /*
  async run(): Promise<void> {

    let interval = 1000;
    let isRunning = true;

    process.on('SIGINT', async () => {
      console.log('Caught keyboard interrupt. Exiting.');
      isRunning = false;
    });

    process.on('unhandledRejection', (err, promise) => {
      console.error('Unhandled rejection (promise: ', promise, ', reason: ', err, ').');
    });

    console.log(`RUNNING SIMULATION`);

    while (isRunning) {
      try {

        //TODO simulate random user actions.

      } catch (e) {
        console.log(e);
      } finally {
        await sleep(interval);
      }
    }

  }
  */

  async printAccounts(): Promise<void> {
    for (const account of this.config.accounts) {
      const marginAccount: MarginAccount = await MarginAccount.load({
        programs: this.programs,
        provider: this.provider,
        owner: this.account.publicKey,
        seed: account.seed
      });
      await printAccount(marginAccount);
    }
  }

  async closeAccounts(): Promise<void> {
    for (const account of this.config.accounts) {
      const marginAccount: MarginAccount = await MarginAccount.load({
        programs: this.programs,
        provider: this.provider,
        owner: this.account.publicKey,
        seed: account.seed
      });
      await this.closeAccount(marginAccount);
      //await printAccount(marginAccount)
    }
  }

  async closeAccount(marginAccount: MarginAccount) {
    await marginAccount.refresh();

    let dirty = false;

    for (const position of marginAccount.getPositions()) {
      switch (position.kind) {
        case 2: {
          for (const pool of this.pools!) {
            if (pool.addresses.loanNoteMint.toString() == position.token.toBase58()) {
              const depositPosition = getDepositPosition(marginAccount, pool.addresses.depositNoteMint);
              const existingDeposit = depositPosition ? depositPosition.balance : ZERO_BN;
              if (existingDeposit.lt(new BN(position.balance.toNumber() * 1.1))) {
                const tokenConfig = this.marginConfig.tokens[pool.symbol!];
                assert(tokenConfig);
                assert(tokenConfig.decimals);
                assert(tokenConfig.faucet);
                const tokenAccount: PublicKey = await getAssociatedTokenAddress(
                  new PublicKey(tokenConfig.mint),
                  this.account.publicKey,
                  true
                );
                //console.log(`DEPOSIT ${pool.symbol} = ${position.balance} | ${existingDeposit}`)
                const amount = new BN(position.balance.toNumber() * 1.1).sub(existingDeposit);
                await airdropTokens(
                  this.connection,
                  this.faucetProgramId,
                  // @ts-ignore
                  this.account,
                  new PublicKey(tokenConfig.faucet),
                  tokenAccount,
                  amount
                );
                const txid = await pool.deposit({
                  marginAccount,
                  source: tokenAccount,
                  change: PoolTokenChange.shiftBy(amount)
                });
              }

              dirty = true;
              const change = PoolTokenChange.setTo(0);
              await pool.marginRepay({ marginAccount, pools: this.pools!, change, closeLoan: true });
              break;
            }
          }
          break;
        }
      }
    }

    if (dirty) {
      await marginAccount.refresh();
    }

    for (const position of marginAccount.getPositions()) {
      switch (position.kind) {
        case 1: {
          for (const pool of this.pools!) {
            if (pool.addresses.depositNoteMint.toString() == position.token.toBase58()) {
              const destination: PublicKey = await getAssociatedTokenAddress(
                new PublicKey(pool.tokenMint),
                this.account.publicKey,
                true
              );
              if (position.balance.gt(ZERO_BN)) {
                const change = PoolTokenChange.setTo(0);
                await pool.withdraw({ marginAccount, pools: this.pools!, change, destination });
              }
              //console.log('');
              //console.log(`position = ${JSON.stringify(position)}`);
              //console.log('');
              await marginAccount.closePosition(position);
              await marginAccount.refresh();
              break;
            }
          }
          break;
        }
      }
    }

    await marginAccount.closeAccount();
  }
}

export function getDepositPosition(marginAccount: MarginAccount, depositNoteMint: PublicKey) {
  for (const position of marginAccount.getPositions().reverse()) {
    switch (position.kind) {
      case 1: {
        if (depositNoteMint.toString() == position.token.toBase58()) {
          return position;
        }
        break;
      }
    }
  }
}

export async function closeEmptyPositions(marginAccount: MarginAccount) {
  let closed = false;
  for (const position of marginAccount.getPositions().reverse()) {
    if (position.balance.eq(ZERO_BN)) {
      await marginAccount.closePosition(position);
      closed = true;
    }
  }
  if (closed) {
    await marginAccount.refresh();
  }
}

export async function printAccount(marginAccount: MarginAccount) {
  console.log('');
  console.log(`maginAccount.address = ${marginAccount.address}`);
  await marginAccount.refresh();
  for (const position of marginAccount.getPositions()) {
    switch (position.kind) {
      case 0: {
        break;
      }
      case 1: {
        console.log(`  deposit balance: ${position.balance}`);
        break;
      }
      case 2: {
        console.log(`  claim balance: ${position.balance}`);
        break;
      }
    }
  }
  for (const position of marginAccount.getPositions()) {
    console.log(`position = ${JSON.stringify(position)}`);
  }
  console.log('');
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
