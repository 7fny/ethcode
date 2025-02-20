import type * as vscode from 'vscode'
import { window, workspace } from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { type JsonFragment } from '@ethersproject/abi'

import {
  type CompiledJSONOutput,
  type ConstructorInputValue,
  getAbi,
  type IFunctionQP,
  type EstimateGas,
  type Fees
} from '../types'
import { logger } from '../lib'
import { errors } from '../config'
import {
  createDeployedFile,
  writeConstructor,
  writeFunction
} from '../lib/file'
import { getSelectedNetConf } from './networks'
import { get1559Fees } from './get1559Fees'
import { getSelectedProvider } from './utils'
import axios from 'axios'
import { type ethers, utils } from 'ethers'

const createDeployed: any = (contract: CompiledJSONOutput) => {
  const fullPath = getDeployedFullPath(contract)
  if (fs.existsSync(fullPath)) {
    logger.success(
      'Functions input file already exists, remove it to add a empty file.'
    )
    return
  }

  if (
    contract === undefined ||
    contract == null ||
    workspace.workspaceFolders === undefined
  ) {
    logger.error(errors.ContractNotFound)
    return
  }

  const input = {
    address: '',
    commit: '<git-commit>'
  }

  createDeployedFile(getDeployedFullPath(contract), contract, input)
}

const createFunctionInput: any = (contract: CompiledJSONOutput) => {
  const fullPath = getFunctionInputFullPath(contract)
  if (fs.existsSync(fullPath)) {
    logger.success(
      'Functions input file already exists, remove it to add a empty file.'
    )
    return
  }

  if (
    contract === undefined ||
    contract == null ||
    workspace.workspaceFolders === undefined
  ) {
    logger.error(errors.ContractNotFound)
    return
  }

  const functionsAbi = getAbi(contract)?.filter(
    (i: JsonFragment) => i.type === 'function'
  )
  if (functionsAbi === undefined || functionsAbi.length === 0) {
    logger.error("This contract doesn't have any function")
    return
  }

  const functions = functionsAbi.map((e: any) => ({
    name: e.name,
    stateMutability: e.stateMutability,
    ...(e.stateMutability === 'payable'
      ? {
          inputs: [
            ...e.inputs?.map((c: any) => ({
              ...c,
              value: ''
            })),
            {
              value: 0,
              type: 'payable',
              unit: 'gwei'
            }]
        }
      : {
          inputs: [
            ...e.inputs?.map((c: any) => ({
              ...c,
              value: ''
            }))]
        })
  }))
  console.log(functions)

  writeFunction(getFunctionInputFullPath(contract), contract, functions)
}

const getDeployedFullPath: any = (contract: CompiledJSONOutput) => {
  if (contract.path === undefined) {
    throw new Error('Contract Path is empty.')
  }

  return path.join(contract.path, `${contract.name as string}_deployed_address.json`)
}

const getFunctionInputFullPath: any = (contract: CompiledJSONOutput) => {
  if (contract.path === undefined) {
    throw new Error('Contract Path is empty.')
  }

  return path.join(contract.path, `${contract.name as string}_functions_input.json`)
}

const getConstructorInputFullPath: any = (contract: CompiledJSONOutput) => {
  if (contract.path === undefined) {
    throw new Error('Contract Path is empty.')
  }

  return path.join(contract.path, `${contract.name as string}_constructor_input.json`)
}

const getDeployedInputs: any = (context: vscode.ExtensionContext) => {
  try {
    const contract = context.workspaceState.get(
      'contract'
    ) as CompiledJSONOutput
    const fullPath = getDeployedFullPath(contract)
    const inputs = fs.readFileSync(fullPath).toString()
    return JSON.parse(inputs)
  } catch (e) {
    return undefined
  }
}

const getConstructorInputs: any = (context: vscode.ExtensionContext) => {
  try {
    const contract = context.workspaceState.get(
      'contract'
    ) as CompiledJSONOutput
    const fullPath = getConstructorInputFullPath(contract)
    const inputs = fs.readFileSync(fullPath).toString()

    const constructorInputs: ConstructorInputValue[] = JSON.parse(inputs)
    return constructorInputs.map((e) => e.value) // flattened parameters of input
  } catch (e) {
    return []
  }
}

const getFunctionParmas: any = (func: JsonFragment) => {
  const inputs = func.inputs?.map((e) => e.type)
  return inputs?.join(', ')
}

const getFunctionInputs: any = async (
  context: vscode.ExtensionContext
): Promise<JsonFragment> => {
  return await new Promise((resolve, reject) => {
    try {
      const contract = context.workspaceState.get(
        'contract'
      ) as CompiledJSONOutput
      const fullPath = getFunctionInputFullPath(contract)
      const inputs = fs.readFileSync(fullPath).toString()

      const functions: JsonFragment[] = JSON.parse(inputs)

      const quickPick = window.createQuickPick<IFunctionQP>()
      quickPick.items = functions.map((f) => ({
        label: `${contract.name as string} > ${f.name as string}(${getFunctionParmas(f) as string})`,
        functionKey: f.name
      })) as IFunctionQP[]
      quickPick.placeholder = 'Select function'
      quickPick.onDidChangeSelection(() => {
        const selection = quickPick.selectedItems[0]
        if ((selection != null) && (workspace.workspaceFolders != null)) {
          const { functionKey } = selection
          quickPick.dispose()
          const abiItem = functions.filter(
            (i: JsonFragment) => i.name === functionKey
          )
          if (abiItem.length === 0) throw new Error('No function is selected')
          resolve(abiItem[0])
        }
      })
      quickPick.onDidHide(() => {
        quickPick.dispose()
      })
      quickPick.show()
    } catch (err) {
      reject(err)
    }
  })
}

const shouldCreateFile = (contract: CompiledJSONOutput): boolean => {
  const fullPath = getConstructorInputFullPath(contract)
  if (fs.existsSync(fullPath)) {
    return false
  }
  return true
}

const createConstructorInput: any = (contract: CompiledJSONOutput) => {
  if (!shouldCreateFile(contract)) {
    logger.success(
      'Constructor file already exists, remove it to add a empty file'
    )
    return
  }
  if (
    contract === undefined ||
    contract == null ||
    workspace.workspaceFolders === undefined
  ) {
    logger.error(errors.ContractNotFound)
    return
  }

  const constructor = getAbi(contract)?.filter(
    (i: JsonFragment) => i.type === 'constructor'
  )
  if (constructor === undefined) {
    logger.log("Abi doesn't exist on the loaded contract")
    return
  }

  if (constructor.length === 0) {
    logger.log("This abi doesn't have any constructor")
    return
  }

  const constInps = constructor[0].inputs
  if ((constInps == null) || constInps.length === 0) {
    logger.log('The constructor have no parameters')
    return
  }

  const inputs: ConstructorInputValue[] = constInps.map(
    (inp: any) => {
      return { ...inp, value: '' }
    }
  )

  writeConstructor(getConstructorInputFullPath(contract), contract, inputs)
}

const getNetworkBlockpriceUrl: any = (context: vscode.ExtensionContext) => {
  const chainID = getSelectedNetConf(context).chainID
  if (chainID === '137' || chainID === '1') {
    return `https://api.blocknative.com/gasprices/blockprices?chainid=${chainID}`
  } else { /* empty */ }
}

export const getNetworkFeeData = async (context: vscode.ExtensionContext): Promise<Fees> => {
  const chainID = getSelectedNetConf(context).chainID
  const gasCondition = (await context.workspaceState.get(
    'gas'
  )) as string
  if (chainID === '137' || chainID === '1') {
    const feeData = await getGasEstimates(gasCondition, context)
    return {
      maxFeePerGas: utils.parseUnits(feeData.maxFeePerGas.toString(), 'gwei').toBigInt() ?? BigInt(0),
      maxPriorityFeePerGas: utils.parseUnits(feeData.maxPriorityFeePerGas.toString(), 'gwei').toBigInt() ?? BigInt(0)
    }
  } else {
    const provider = getSelectedProvider(context) as ethers.providers.JsonRpcProvider
    const feeData = await provider.getFeeData()
    return {
      maxFeePerGas: feeData.maxFeePerGas?.toBigInt() ?? BigInt(0),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toBigInt() ?? BigInt(0)
    }
  }
}

const getGasEstimates: any = async (
  condition: string,
  context: vscode.ExtensionContext
) => {
  let estimate: EstimateGas | undefined
  const chainID = getSelectedNetConf(context).chainID
  // try to use `eth_feeHistory` RPC API
  const provider = getSelectedProvider(
    context
  ) as ethers.providers.JsonRpcProvider
  if (chainID === '59140') {
    const maxFeePerGas = get1559Fees(provider, BigInt(10), 70)
    console.log(maxFeePerGas)
  } else {
    const blockPriceUri = getNetworkBlockpriceUrl(context)
    if (blockPriceUri !== undefined) {
      return await axios
        .get(blockPriceUri, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers':
              'Origin, X-Requested-With, Content-Type, Accept'
          }
        })
        .then((res: any) => {
          if (res.status === 200) {
            switch (condition) {
              case 'Low': {
                estimate = res.data.blockPrices[0].estimatedPrices.find(
                  (x: any) => x.confidence === 70
                ) as EstimateGas
                break
              }
              case 'Medium': {
                estimate = res.data.blockPrices[0].estimatedPrices.find(
                  (x: any) => x.confidence === 90
                ) as EstimateGas
                break
              }
              case 'High': {
                estimate = res.data.blockPrices[0].estimatedPrices.find(
                  (x: any) => x.confidence === 99
                ) as EstimateGas
                break
              }
            }
            return estimate
          }
        })
        .catch((error: any) => {
          console.error(error)
        })
    }
  }
}

const fetchERC4907Contracts: any = async (uri: string) => {
  const response = await axios
    .get(uri)
    .then((res) => {
      return res.data
    })
    .catch((err) => {
      console.error('an error occoured while fetch files:', err)
    })
  return response
}

// Checks is hardhat project
const isHardhatProject = (path_: string): boolean => {
  return (
    fs
      .readdirSync(path_)
      .filter(
        (file) => file === 'hardhat.config.js' || file === 'hardhat.config.ts'
      ).length > 0
  )
}

// Checks is foundry project
const isFoundryProject = async (): Promise<boolean> => {
  const foundryConfigFile = await workspace.findFiles('**/foundry.toml', '**/{node_modules,lib}/**')
  if (foundryConfigFile.length > 0) {
    return true
  } else {
    return false
  }
}

export {
  createFunctionInput,
  createDeployed,
  createConstructorInput,
  getConstructorInputs,
  getFunctionInputs,
  getDeployedInputs,
  getGasEstimates,
  fetchERC4907Contracts,
  getDeployedFullPath,
  getFunctionInputFullPath,
  getConstructorInputFullPath,
  isHardhatProject,
  isFoundryProject
}
