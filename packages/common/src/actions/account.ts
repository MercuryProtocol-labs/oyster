import { AccountLayout, MintLayout, Token } from '@solana/spl-token';
import {
  Account,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  programIds,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  WRAPPED_SOL_MINT,
} from '../utils/ids';
import { deserializeBorsh } from './../utils/borsh';
import { TokenAccount } from '../models/account';
import { cache, TokenAccountParser } from '../contexts/accounts';
import { serialize, BinaryReader, Schema, BorshError } from 'borsh';

export const MAX_NAME_LENGTH = 32;

export const MAX_SYMBOL_LENGTH = 10;

export const MAX_URI_LENGTH = 200;

export const MAX_METADATA_LEN =
  32 + MAX_NAME_LENGTH + MAX_SYMBOL_LENGTH + MAX_URI_LENGTH + 200;

export const MAX_OWNER_LEN = 32 + 32;

export function ensureSplAccount(
  instructions: TransactionInstruction[],
  cleanupInstructions: TransactionInstruction[],
  toCheck: TokenAccount,
  payer: PublicKey,
  amount: number,
  signers: Account[],
) {
  if (!toCheck.info.isNative) {
    return toCheck.pubkey;
  }

  const account = createUninitializedAccount(
    instructions,
    payer,
    amount,
    signers,
  );

  instructions.push(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      account,
      payer,
    ),
  );

  cleanupInstructions.push(
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      account,
      payer,
      payer,
      [],
    ),
  );

  return account;
}

export const DEFAULT_TEMP_MEM_SPACE = 65548;

export function createTempMemoryAccount(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  signers: Account[],
  owner: PublicKey,
  space = DEFAULT_TEMP_MEM_SPACE,
) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      // 0 will evict/close account since it cannot pay rent
      lamports: 0,
      space: space,
      programId: owner,
    }),
  );

  signers.push(account);

  return account.publicKey;
}

export function createUninitializedMint(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  amount: number,
  signers: Account[],
) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: amount,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  signers.push(account);

  return account.publicKey;
}

export function createUninitializedAccount(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  amount: number,
  signers: Account[],
) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: amount,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  signers.push(account);

  return account.publicKey;
}

export function createAssociatedTokenAccountInstruction(
  instructions: TransactionInstruction[],
  associatedTokenAddress: PublicKey,
  payer: PublicKey,
  walletAddress: PublicKey,
  splTokenMintAddress: PublicKey,
) {
  const keys = [
    {
      pubkey: payer,
      isSigner: true,
      isWritable: true,
    },
    {
      pubkey: associatedTokenAddress,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: walletAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: splTokenMintAddress,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  instructions.push(
    new TransactionInstruction({
      keys,
      programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      data: Buffer.from([]),
    }),
  );
}

class CreateMetadataArgs {
  instruction: number = 0;
  allow_duplicates: boolean = false;
  name: string;
  symbol: string;
  uri: string;

  constructor(args: { name: string; symbol: string; uri: string }) {
    this.name = args.name;
    this.symbol = args.symbol;
    this.uri = args.uri;
  }
}
class UpdateMetadataArgs {
  instruction: number = 1;
  uri: string;
  // Not used by this app, just required for instruction
  non_unique_specific_update_authority: number;

  constructor(args: { uri: string }) {
    this.uri = args.uri;
    this.non_unique_specific_update_authority = 0;
  }
}

export class Metadata {
  updateAuthority?: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  extended?: any;

  constructor(args: {
    updateAuthority?: Buffer;
    mint: Buffer;
    name: string;
    symbol: string;
    uri: string;
  }) {
    this.updateAuthority =
      args.updateAuthority && new PublicKey(args.updateAuthority);
    this.mint = new PublicKey(args.mint);
    this.name = args.name;
    this.symbol = args.symbol;
    this.uri = args.uri;
  }
}

export class NameSymbolTuple {
  updateAuthority: PublicKey;
  metadata: PublicKey;

  constructor(args: { updateAuthority: Buffer; metadata: Buffer }) {
    this.updateAuthority = new PublicKey(args.updateAuthority);
    this.metadata = new PublicKey(args.metadata);
  }
}

export const SCHEMA = new Map<any, any>([
  [
    CreateMetadataArgs,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['allow_duplicates', 'u8'],
        ['name', 'string'],
        ['symbol', 'string'],
        ['uri', 'string'],
      ],
    },
  ],
  [
    UpdateMetadataArgs,
    {
      kind: 'struct',
      fields: [
        ['instruction', 'u8'],
        ['uri', 'string'],
        ['non_unique_specific_update_authority', 'u8'],
      ],
    },
  ],
  [
    Metadata,
    {
      kind: 'struct',
      fields: [
        ['allow_duplicates', { kind: 'option', type: 'u8' }],
        ['mint', [32]],
        ['name', 'string'],
        ['symbol', 'string'],
        ['uri', 'string'],
      ],
    },
  ],
  [
    NameSymbolTuple,
    {
      kind: 'struct',
      fields: [
        ['update_authority', [32]],
        ['metadata', [32]],
      ],
    },
  ],
]);

export const decodeMetadata = (buffer: Buffer) => {
  return deserializeBorsh(SCHEMA, Metadata, buffer) as Metadata;
};

export function createMint(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  mintRentExempt: number,
  decimals: number,
  owner: PublicKey,
  freezeAuthority: PublicKey,
  signers: Account[],
) {
  const account = createUninitializedMint(
    instructions,
    payer,
    mintRentExempt,
    signers,
  );

  instructions.push(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      account,
      decimals,
      owner,
      freezeAuthority,
    ),
  );

  return account;
}
export async function updateMetadata(
  symbol: string,
  name: string,
  uri: string,
  mintKey: PublicKey,
  updateAuthority: PublicKey,
  instructions: TransactionInstruction[],
  signers: Account[],
) {
  const metadataProgramId = programIds().metadata;

  const metadataAccount = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        mintKey.toBuffer(),
      ],
      metadataProgramId,
    )
  )[0];

  const metadataOwnerAccount = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        Buffer.from(name),
        Buffer.from(symbol),
      ],
      metadataProgramId,
    )
  )[0];

  const value = new UpdateMetadataArgs({ uri });
  const data = Buffer.from(serialize(SCHEMA, value));

  const keys = [
    {
      pubkey: metadataAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: updateAuthority,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: metadataOwnerAccount,
      isSigner: false,
      isWritable: false,
    },
  ];
  instructions.push(
    new TransactionInstruction({
      keys,
      programId: metadataProgramId,
      data,
    }),
  );
}

export async function createMetadata(
  symbol: string,
  name: string,
  uri: string,
  mintKey: PublicKey,
  mintAuthorityKey: PublicKey,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  updateAuthority: PublicKey,
  signers: Account[],
) {
  const metadataProgramId = programIds().metadata;

  const metadataAccount = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        mintKey.toBuffer(),
      ],
      metadataProgramId,
    )
  )[0];

  const metadataOwnerAccount = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        Buffer.from(name),
        Buffer.from(symbol),
      ],
      metadataProgramId,
    )
  )[0];

  const value = new CreateMetadataArgs({ name, symbol, uri });
  const data = Buffer.from(serialize(SCHEMA, value));

  const keys = [
    {
      pubkey: metadataOwnerAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: metadataAccount,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mintKey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: mintAuthorityKey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: payer,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: updateAuthority,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  instructions.push(
    new TransactionInstruction({
      keys,
      programId: metadataProgramId,
      data,
    }),
  );
}

export function createTokenAccount(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  accountRentExempt: number,
  mint: PublicKey,
  owner: PublicKey,
  signers: Account[],
) {
  const account = createUninitializedAccount(
    instructions,
    payer,
    accountRentExempt,
    signers,
  );

  instructions.push(
    Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, mint, account, owner),
  );

  return account;
}

// TODO: check if one of to accounts needs to be native sol ... if yes unwrap it ...
export function findOrCreateAccountByMint(
  payer: PublicKey,
  owner: PublicKey,
  instructions: TransactionInstruction[],
  cleanupInstructions: TransactionInstruction[],
  accountRentExempt: number,
  mint: PublicKey, // use to identify same type
  signers: Account[],
  excluded?: Set<string>,
): PublicKey {
  const accountToFind = mint.toBase58();
  const account = cache
    .byParser(TokenAccountParser)
    .map(id => cache.get(id))
    .find(
      acc =>
        acc !== undefined &&
        acc.info.mint.toBase58() === accountToFind &&
        acc.info.owner.toBase58() === owner.toBase58() &&
        (excluded === undefined || !excluded.has(acc.pubkey.toBase58())),
    );
  const isWrappedSol = accountToFind === WRAPPED_SOL_MINT.toBase58();

  let toAccount: PublicKey;
  if (account && !isWrappedSol) {
    toAccount = account.pubkey;
  } else {
    // creating depositor pool account
    toAccount = createTokenAccount(
      instructions,
      payer,
      accountRentExempt,
      mint,
      owner,
      signers,
    );

    if (isWrappedSol) {
      cleanupInstructions.push(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          toAccount,
          payer,
          payer,
          [],
        ),
      );
    }
  }

  return toAccount;
}
