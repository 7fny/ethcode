// @ts-ignore
import * as solc from "solc";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import { RemixURLResolver } from "remix-url-resolver";
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
const Web3 = require("web3")
const w3: any = new Web3("http://localhost:8545");

// console.log("ETHhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh: ")
// console.log(w3.eth.accounts);

const PROTO_PATH = [path.join(__dirname, '../services/remix-tests.proto'), path.join(__dirname, '../services/client-call.proto'), path.join(__dirname, '../services/remix-debug.proto')];
const packageDefinition = protoLoader.loadSync(PROTO_PATH,
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
);
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

// remix-tests grpc
const remix_tests_pb = protoDescriptor.remix_tests;
const remix_debug_pb = protoDescriptor.remix_debug;

let remix_tests_client: any;
let remix_debug_client: any;
try {
  remix_tests_client = new remix_tests_pb.RemixTestsService('rt.ethco.de:50051', grpc.credentials.createInsecure());

} catch (e) {
  // @ts-ignore
  process.send({ error: e });
}

// remix-debug grpc
try {
  remix_debug_client = new remix_debug_pb.RemixDebugService('rd.ethco.de:50052', grpc.credentials.createInsecure());

  // remix_debug_client = new remix_debug_pb.RemixDebugService('192.168.0.18:50052', grpc.credentials.createInsecure());
} catch (e) {
  // @ts-ignore
  process.send({ error: e });
}

// client-call grpc
const client_call_pb = protoDescriptor.eth_client_call;
let client_call_client: any;
try {
  client_call_client = new client_call_pb.ClientCallService('cc.ethco.de:50053', grpc.credentials.createInsecure());

} catch (e) {
  // @ts-ignore
  process.send({ error: e });
}

function handleLocal(pathString: string, filePath: any) {
  // if no relative/absolute path given then search in node_modules folder
  if (
    pathString &&
    pathString.indexOf(".") !== 0 &&
    pathString.indexOf("/") !== 0
  ) {
    // return handleNodeModulesImport(pathString, filePath, pathString)
    return;
  } else {
    const o = { encoding: "UTF-8" };
    const p = pathString
      ? path.resolve(pathString, filePath)
      : path.resolve(pathString, filePath);
    const content = fs.readFileSync(p, o);
    return content;
  }
}

function findImports(path: any) {
  // TODO: We need current solc file path here for relative local import
  // @ts-ignore
  process.send({ processMessage: "importing file: " + path });
  const FSHandler = [
    {
      type: "local",
      match: (url: string) => {
        return /(^(?!(?:http:\/\/)|(?:https:\/\/)?(?:www.)?(?:github.com)))(^\/*[\w+-_/]*\/)*?(\w+\.sol)/g.exec(
          url
        );
      },
      handle: (match: Array<string>) => {
        return handleLocal(match[2], match[3]);
      }
    }
  ];
  // @ts-ignore
  const urlResolver = new RemixURLResolver();
  urlResolver
    .resolve(path, FSHandler)
    .then((data: any) => {
      // @ts-ignore
      process.send({ data, path });
    })
    .catch((e: Error) => {
      throw e;
    });
}

process.on("message", async m => {

  var meta = new grpc.Metadata();
  meta.add('authorization', m.jwtToken);
  if (m.command === "compile") {
    const input = m.payload;
    if(m.version === 'latest') {
      try {
        const output = await solc.compile(JSON.stringify(input), findImports);
        // @ts-ignore
        process.send({ compiled: output });
      } catch (e) {
        // @ts-ignore
        process.send({ error: e });
      }
    }
    solc.loadRemoteVersion(m.version, async (err: Error, newSolc: any) => {
      if(err) {
        // @ts-ignore
        process.send({ error: e });
      } else {
        try {
          const output = await newSolc.compile(
            JSON.stringify(input),
            findImports
          );
          // @ts-ignore
          process.send({ compiled: output });
        } catch (e) {
          // @ts-ignore
          process.send({ error: e });
        }
      }
    });
  }
  if(m.command === "fetch_compiler_verison") {
    axios
      .get("https://ethereum.github.io/solc-bin/bin/list.json")
      .then((res: any) => {
        // @ts-ignore
        process.send({ versions: res.data });
      })
      .catch((e: Error) => {
        // @ts-ignore
        process.send({ error: e });
      });
  }
  if(m.command === "run-test") {
    // TODO: move parsing to extension.ts
    // const sources = JSON.parse(m.payload);
    const rt = {
      testInterface: {
        command: 'run-test-sources',
        payload: m.payload
      }
    }
    const call = remix_tests_client.RunTests(rt);
    call.on('data', (data: any) => {
      const result = JSON.parse(data.result);
      if(result.filePath) {
        findImports(result.filePath);
      } else {
        // @ts-ignore
        process.send({ utResp: data });
      }
    });
    call.on('end', function() {
      process.exit(0);
    });
  }
 // Fetch accounts and balance
  if(m.command === "get-accounts") {
    const c = {
      callInterface: {
        command: 'get-accounts'
      }
    }
    const call = client_call_client.RunDeploy(c, meta, (err: any, response: any) => {
      if (err) {
        console.log("err", err);
      } else {
        // @ts-ignore
        process.send({ response });
      }
    });

    call.on('error', (data: any) => {
      // @ts-ignore
      process.send({ error: data });
    })

    call.on('data', (data: any) =>{
      // @ts-ignore
      const result = JSON.parse(data.result);
      // @ts-ignore
      process.send({ accounts: result.accounts, balance: result.balance });
    })
  }
  // send wei_value to a address
  if(m.command === "send-ether") {
    const transactionInfo = m.transactionInfo;
    const c = {
      callInterface: {
        command: 'send-ether',
        payload: JSON.stringify(transactionInfo),
        testnetId: m.testnetId
      }
    };
    const call = client_call_client.RunDeploy(c, meta, (err: any, response: any) => {
      if (err) {
        console.log("err", err);
      } else {
        // @ts-ignore
        process.send({ response });
      }
    });
    call.on('data', (data: any) => {
      // @ts-ignore
      process.send({ transactionResult: data.result });
    })
  }
  // fetch balance of a account
  if(m.command === "get-balance") {
    const c = {
      callInterface: {
        command: 'get-balance',
        payload: m.account
      }
    }
    const call = client_call_client.RunDeploy(c, meta, (err: any, response: any) => {
      if (err) {
        console.log("err", err);
      } else {
        // @ts-ignore
        process.send({ response });
      }
    });
    call.on('data', (data: any) => {
      // @ts-ignore
      process.send({ balance: data.result });
    })
  }
  // Deploy
  if(m.command === "deploy-contract") {
    if (m.jwtToken) {
      // @ts-ignore
      process.send({ jwtToken: m.jwtToken });
    }
    const { abi, bytecode, params, gasSupply } = m.payload;
    const inp = {
      abi,
      bytecode,
      params,
      gasSupply: (typeof gasSupply) === 'string' ? parseInt(gasSupply) : gasSupply
    };
    const c = {
      callInterface: {
        command: 'deploy-contract',
        payload: JSON.stringify(inp),
        testnetId: m.testnetId
      }
    };
    // @ts-ignore
    process.send({ help: m.jwtToken });
    const call = client_call_client.RunDeploy(c, meta, (err: any, response: any) => {
      if (err) {
        console.log("err", err);
      } else {
        // @ts-ignore
        process.send({ response });
      }
    });
    call.on('data', (data: any) => {
      // @ts-ignore
      process.send({ deployedResult: data.result });
    });
    call.on('end', function() {
      process.exit(0);
    });
    call.on('error', function(err: Error) {
      // @ts-ignore
      process.send({ "error": err });
    })
  }
  // Method call
  if(m.command === "contract-method-call") {
    const { abi, address, methodName, params, gasSupply, deployAccount } = m.payload;
    const inp = {
      abi,
      address,
      methodName,
      params,
      gasSupply: (typeof gasSupply) === 'string' ? parseInt(gasSupply) : gasSupply,
      deployAccount
    };
    const c = {
      callInterface: {
        command: 'contract-method-call',
        payload: JSON.stringify(inp),
        testnetId: m.testnetId
      }
    };
    const call = client_call_client.RunDeploy(c, meta, (err: any, response: any) => {
      if (err) {
        console.log("err", err);
      } else {
        // @ts-ignore
        process.send({ response });
      }
    });
    call.on('data', (data: any) => {
      // @ts-ignore
      process.send({ callResult: data.result });
    });
    call.on('end', function() {
      process.exit(0);
    });
    call.on('error', function(err: Error) {
      // @ts-ignore
      process.send({ "error": err });
    })
  }
  // Gas Estimate
  if(m.command === "get-gas-estimate") {
    const { abi, bytecode, params } = m.payload;
    const inp = {
      abi,
      bytecode,
      params
    }
    const c = {
      callInterface: {
        command: 'get-gas-estimate',
        payload: JSON.stringify(inp),
        testnetId: m.testnetId
      }
    };
    const call = client_call_client.RunDeploy(c, meta, (err: any, response: any) => {
      if (err) {
        console.log("err", err);
      } else {
        // @ts-ignore
        process.send({ response });
      }
    });
    call.on('data', (data: any) => {
      // @ts-ignore
      process.send({ gasEstimate: data.result });
    });
    call.on('error', function(err: Error) {
      // @ts-ignore
      process.send({ "error": err });
    });
  }
  // Debug transaction
  if(m.command === "debug-transaction") {
    const dt = {
      debugInterface: {
        command: 'debug',
        payload: m.payload,
        testnetId: m.testnetId
      }
    };
    // @ts-ignore
    process.send({ message: "BEFORE" });
    const call = remix_debug_client.RunDebug(dt);
    // @ts-ignore
    process.send({ message: "AFTER" });
    call.on('data', (data: any) => {
      // @ts-ignore
      process.send({ debugResp: data.result });
    });
    call.on('end', function() {
      process.exit(0);
    });
    call.on('error', function(err: Error) {
      // @ts-ignore
      process.send({ "error": err });
    });
  }
  if(m.command == "create-Account") {
    // const payload = JSON.parse(m.payload)
    // const c = {
    //   to: payload.to,
    //   data: payload.data,
    //   value: payload.value,
    //   gas: payload.gas
    // };
    const c = {
      to: "0x4266E7ab5ECBdcfA7EF96000Bd05C1EeF8da6dD1",
      data: w3.utils.utf8ToHex("Hello"),
      value: 27,
      gas: 900000
    };
    const call = client_call_client.CreateRawTransaction(c, meta, (err: any, responses: any) => {
      if (err) {
        console.log("err", err);
      } else {
        const tx = JSON.parse(responses.rawTX);
        // @ts-ignore
        process.send({ responses: tx });
        w3.eth.accounts.signTransaction(tx, "0x5a0c431391c6130b1980ffe11a557313d8fb430ab1f322a529f2e9b69fda2d0a").then((signedTX: any) => {
          // @ts-ignore
          process.send({ raw: JSON.stringify(signedTX) });
          const strSignedTX = JSON.stringify(signedTX)
          const callData = {
            signedTX: strSignedTX
          }
          const resp = client_call_client.DeploySignedTransaction(callData, meta, (err: any, response: any) => {
            if (err) {
              console.log("err", err);
            } else {
              // @ts-ignore
              process.send({ response });
            }
          });
          resp.on('data', (data: any) => {
            const result = JSON.parse(data.result);
            // @ts-ignore
            process.send({ signedTransaction: result });
          });
          resp.on('end', function() {
            process.exit(0);
          });
          resp.on('error', function(err: Error) {
            // @ts-ignore
            process.send({ "error": err });
          });
        }).catch((e: any) => {
          // @ts-ignore
          process.send({ raw: e });
        });
      }
    });
    call.on('data', (data: any) => {
      const tx = JSON.parse(data.rawTX);
      var signedTX: any;
      if(true) {
        try {
           signedTX = w3.eth.accounts.signTransaction(tx, "0xe826d62a0fa5e334f5846a58315f669c9c75530c6c8fcba10049bce87d856c79")
        } catch(e) {
          // @ts-ignore
          process.send({ raw: e });
        }
        // @ts-ignore
        process.send({ raw: signedTX });
        const strSignedTX = JSON.stringify(signedTX)
        const callData = {
          signedTX: strSignedTX
        }
        const resp = client_call_client.DeploySignedTransaction(callData, meta, (err: any, response: any) => {
          if (err) {
            console.log("err", err);
          } else {
            // @ts-ignore
            process.send({ response });
          }
        });
        resp.on('data', (data: any) => {
          const result = JSON.parse(data.result);
          // @ts-ignore
          process.send({ signedTransaction: result });
        });
        resp.on('end', function() {
          process.exit(0);
        });
        resp.on('error', function(err: Error) {
          // @ts-ignore
          process.send({ "error": err });
        });
      } else {
        // @ts-ignore
        process.send({ rawTransaction: tx });
      }
    });
    call.on('end', function() {
      process.exit(0);
    });
    call.on('error', function(err: Error) {
      // @ts-ignore
      process.send({ "error": err });
    });
  }
});
