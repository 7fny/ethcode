// This file is a copy of https://github.com/ethereum/remix-plugin/blob/8e494ee10f8539e74cd7ba30b6bddf1cb2ccd025/packages/api/src/lib/compiler/type/output.ts
/// //////////
// SOURCES //
/// //////////
export interface CompilationFileSources {
  [fileName: string]: {
    // Optional: keccak256 hash of the source file
    keccak256?: string;
    // Required (unless "urls" is used): literal contents of the source file
    content: string;
    urls?: string[];
  };
}

export interface SourceWithTarget {
  sources?: CompilationFileSources;
  target?: string | null | undefined;
}

/// /////////
// RESULT //
/// /////////

export interface HardhatJSONOutput {
  /** not present if no errors/warnings were encountered */
  errors?: CompilationError[];
  /** This contains the file-level outputs. In can be limited/filtered by the outputSelection settings */
  sources: {
    [contractName: string]: CompilationSource;
  };
  /** This contains the contract-level outputs. It can be limited/filtered by the outputSelection settings */
  contracts: CombinedJSONContracts;
  sourceList: Array<string>;
  version: string;
}

export interface RemixJSONOutput {
  output: {
    abi: ABIDescription[];
  },

  sources: {
    [contractName: string]: CompilationSource;
  };
}

export interface CombinedJSONOutput {
  hardhatOutput?: HardhatJSONOutput;
  remixOutput?: RemixJSONOutput;
  contractType: number;  // 1: Hardhat, 2: Remix
}

export interface StandardJSONOutput {
  /** not present if no errors/warnings were encountered */
  errors?: CompilationError[];
  /** This contains the file-level outputs. In can be limited/filtered by the outputSelection settings */
  sources: {
    [contractName: string]: CompilationSource;
  };
  /** This contains the contract-level outputs. It can be limited/filtered by the outputSelection settings */
  contracts: StandardJSONContracts;
  sourceList: Array<string>;
  version: string;
}

export interface CombinedJSONContracts {
  [fileName: string]: CombinedCompiledContract;
}

export interface StandardJSONContracts {
  [fileName: string]: {
    [contract: string]: StandardCompiledContract;
  };
}

/// ////////
// ERROR //
/// ////////

export interface CompilationError {
  /** Location within the source file */
  sourceLocation?: {
    file: string;
    start: number;
    end: number;
  };
  /** Error type */
  type: CompilationErrorType;
  /** Component where the error originated, such as "general", "ewasm", etc. */
  component: 'general' | 'ewasm' | string;
  severity: 'error' | 'warning';
  message: string;
  /** the message formatted with source location */
  formattedMessage?: string;
}

type CompilationErrorType =
  | 'JSONError'
  | 'IOError'
  | 'ParserError'
  | 'DocstringParsingError'
  | 'SyntaxError'
  | 'DeclarationError'
  | 'TypeError'
  | 'UnimplementedFeatureError'
  | 'InternalCompilerError'
  | 'Exception'
  | 'CompilerError'
  | 'FatalError'
  | 'Warning';

/// /////////
// SOURCE //
/// /////////
export interface CompilationSource {
  /** Identifier of the source (used in source maps) */
  id: number;
  /** The AST object */
  ast: AstNode;
  /** The legacy AST object */
  legacyAST: AstNodeLegacy;
}

/// //////
// AST //
/// //////
export interface AstNode {
  absolutePath?: string;
  exportedSymbols?: Object;
  id: number;
  nodeType: string;
  nodes?: Array<AstNode>;
  src: string;
  literals?: Array<string>;
  file?: string;
  scope?: number;
  sourceUnit?: number;
  symbolAliases?: Array<string>;
  [x: string]: any;
}

export interface AstNodeLegacy {
  id: number;
  name: string;
  src: string;
  children?: Array<AstNodeLegacy>;
  attributes?: AstNodeAtt;
}

export interface AstNodeAtt {
  operator?: string;
  string?: null;
  type?: string;
  value?: string;
  constant?: boolean;
  name?: string;
  public?: boolean;
  exportedSymbols?: Object;
  argumentTypes?: null;
  absolutePath?: string;
  [x: string]: any;
}

/// ///////////
// CONTRACT //
/// ///////////
export interface StandardCompiledContract {
  /** The Ethereum Contract ABI. If empty, it is represented as an empty array. */
  abi: ABIDescription[];
  // See the Metadata Output documentation (serialised JSON string)
  metadata: string;
  /** User documentation (natural specification) */
  userdoc: UserDocumentation;
  /** Developer documentation (natural specification) */
  devdoc: DeveloperDocumentation;
  /** Intermediate representation (string) */
  ir: string;
  /** EVM-related outputs */
  evm: {
    assembly: string;
    legacyAssembly: {};
    /** Bytecode and related details. */
    bytecode: BytecodeObject;
    deployedBytecode: BytecodeObject;
    /** The list of function hashes */
    methodIdentifiers: {
      [functionIdentifier: string]: string;
    };
    // Function gas estimates
    gasEstimates: {
      creation: {
        codeDepositCost: string;
        executionCost: 'infinite' | string;
        totalCost: 'infinite' | string;
      };
      external: {
        [functionIdentifier: string]: string;
      };
      internal: {
        [functionIdentifier: string]: 'infinite' | string;
      };
    };
  };
  /** eWASM related outputs */
  ewasm: {
    /** S-expressions format */
    wast: string;
    /** Binary format (hex string) */
    wasm: string;
  };
}

export interface CombinedCompiledContract {
  /** The Ethereum Contract ABI. If empty, it is represented as an empty array. */
  abi: ABIDescription[];
  asm: unknown;
  bin: string;
  'bin-runtime': string;
  // See the Metadata Output documentation (serialised JSON string)
  metadata: string;
  /** User documentation (natural specification) */
  userdoc: UserDocumentation;
  /** Developer documentation (natural specification) */
  devdoc: DeveloperDocumentation;
  opcodes: string;
  hashes: { [key: string]: string };

  /** Solidity Architecture */
  ContractName: any;
}

/// //////
// ABI //
/// //////
export type ABIDescription = FunctionDescription | EventDescription;

export interface FunctionDescription {
  /** Type of the method. default is 'function' */
  type?: 'function' | 'constructor' | 'fallback';
  /** The name of the function. Constructor and fallback functions never have a name */
  name?: string;
  /** List of parameters of the method. Fallback functions don’t have inputs. */
  inputs?: ABIParameter[];
  /** List of the output parameters for the method, if any */
  outputs?: ABIParameter[];
  /** State mutability of the method */
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
  /** true if function accepts Ether, false otherwise. Default is false */
  payable?: boolean;
  /** true if function is either pure or view, false otherwise. Default is false  */
  constant?: boolean;
}

export interface EventDescription {
  type: 'event';
  name: string;
  inputs: ABIParameter &
  {
    /** true if the field is part of the log’s topics, false if it one of the log’s data segment. */
    indexed: boolean;
  }[];
  /** true if the event was declared as anonymous. */
  anonymous: boolean;
}

export interface ABIParameter {
  /** The name of the parameter */
  name: string;
  /** The canonical type of the parameter */
  type: ABITypeParameter;
  /** Used for tuple types */
  components?: ABIParameter[];
}

export type ABITypeParameter =
  | 'uint'
  | 'uint[]' // TODO : add <M>
  | 'int'
  | 'int[]' // TODO : add <M>
  | 'address'
  | 'address[]'
  | 'bool'
  | 'bool[]'
  | 'fixed'
  | 'fixed[]' // TODO : add <M>
  | 'ufixed'
  | 'ufixed[]' // TODO : add <M>
  | 'bytes'
  | 'bytes[]' // TODO : add <M>
  | 'function'
  | 'function[]'
  | 'tuple'
  | 'tuple[]'
  | string; // Fallback

/// ////////////////////////
// NATURAL SPECIFICATION //
/// ////////////////////////

// Userdoc
export interface UserDocumentation {
  methods: UserMethodList;
  notice: string;
}

export type UserMethodList = {
  [functionIdentifier: string]: UserMethodDoc;
} & {
  constructor?: string;
};
export interface UserMethodDoc {
  notice: string;
}

// Devdoc
export interface DeveloperDocumentation {
  author: string;
  title: string;
  details: string;
  methods: DevMethodList;
}

export interface DevMethodList {
  [functionIdentifier: string]: DevMethodDoc;
}

export interface DevMethodDoc {
  author: string;
  details: string;
  return: string;
  returns: {
    [param: string]: string;
  };
  params: {
    [param: string]: string;
  };
}

/// ///////////
// BYTECODE //
/// ///////////
export interface BytecodeObject {
  /** The bytecode as a hex string. */
  object: string;
  /** Opcodes list */
  opcodes: string;
  /** The source mapping as a string. See the source mapping definition. */
  sourceMap: string;
  /** If given, this is an unlinked object. */
  linkReferences?: {
    [contractName: string]: {
      /** Byte offsets into the bytecode. */
      [library: string]: { start: number; length: number }[];
    };
  };
}
