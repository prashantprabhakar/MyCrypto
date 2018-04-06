import BN from 'bn.js';
import abi from 'ethereumjs-abi';
import { toWei, Units, gasPriceToBase, Address } from '../units';
import { toBuffer } from 'ethereumjs-util';
import RequestFactory from './contracts/RequestFactory';

const TIME_BOUNTY_MIN = new BN('1');

export const EAC_SCHEDULING_CONFIG = {
  DAPP_ADDRESS: 'https://app.chronologic.network',
  SCHEDULE_GAS_LIMIT_FALLBACK: new BN('21000'),
  SCHEDULE_GAS_PRICE_FALLBACK: 20, // Gwei
  FEE: new BN('2242000000000000'), // $2
  FEE_MULTIPLIER: new BN('2'),
  FUTURE_EXECUTION_COST: new BN('180000'),
  SCHEDULING_GAS_LIMIT: new BN('1500000'),
  WINDOW_SIZE_DEFAULT_TIME: 10,
  WINDOW_SIZE_DEFAULT_BLOCK: 90,
  TIME_BOUNTY_MIN,
  TIME_BOUNTY_DEFAULT: TIME_BOUNTY_MIN,
  TIME_BOUNTY_MAX: toWei('900', Units.ether.length - 1), // 900 ETH
  SCHEDULE_TIMESTAMP_FORMAT: 'YYYY-MM-DD HH:mm:ss',
  DEFAULT_SCHEDULING_METHOD: 'time'
};

export const EAC_ADDRESSES = {
  KOVAN: {
    blockScheduler: '0x1afc19a7e642761ba2b55d2a45b32c7ef08269d1',
    requestFactory: '0x496e2b6089bde77293a994469b08e9f266d87adb',
    timestampScheduler: '0xc6370807f0164bdf10a66c08d0dab1028dbe80a3'
  }
};

export const calcEACFutureExecutionCost = (
  callGas: BN,
  callGasPrice: BN,
  timeBounty: BN | null
) => {
  const totalGas = callGas.add(EAC_SCHEDULING_CONFIG.FUTURE_EXECUTION_COST);

  if (!timeBounty) {
    timeBounty = EAC_SCHEDULING_CONFIG.TIME_BOUNTY_MIN;
  }

  return timeBounty
    .add(EAC_SCHEDULING_CONFIG.FEE.mul(EAC_SCHEDULING_CONFIG.FEE_MULTIPLIER))
    .add(totalGas.mul(callGasPrice));
};

export const calcEACEndowment = (
  callGas: BN | null,
  callValue: BN | null,
  callGasPrice: BN | null,
  timeBounty: BN
) => {
  callValue = callValue || new BN(0);

  return callValue.add(
    calcEACFutureExecutionCost(
      callGas || EAC_SCHEDULING_CONFIG.SCHEDULE_GAS_LIMIT_FALLBACK,
      callGasPrice || gasPriceToBase(EAC_SCHEDULING_CONFIG.SCHEDULE_GAS_PRICE_FALLBACK),
      timeBounty
    )
  );
};

export const calcEACTotalCost = (
  callGas: BN,
  gasPrice: BN,
  callGasPrice: BN,
  timeBounty: BN | null
) => {
  const deployCost = gasPrice.mul(EAC_SCHEDULING_CONFIG.SCHEDULING_GAS_LIMIT);

  const futureExecutionCost = calcEACFutureExecutionCost(callGas, callGasPrice, timeBounty);

  return deployCost.add(futureExecutionCost);
};

export const getScheduleData = (
  toAddress: string,
  callData: string | Buffer = '',
  callGas: BN | null,
  callValue: BN | null,
  windowSize: BN | null,
  windowStart: any,
  callGasPrice: BN | null,
  timeBounty: BN | null,
  requiredDeposit: BN | null
) => {
  if (!requiredDeposit || requiredDeposit.lt(new BN(0))) {
    requiredDeposit = new BN(0);
  }

  if (typeof callData === 'string') {
    callData = toBuffer(callData);
  }

  if (
    !callValue ||
    !callGas ||
    !callGasPrice ||
    !windowStart ||
    !windowSize ||
    !timeBounty ||
    timeBounty.lt(new BN(0)) ||
    callGasPrice.lt(new BN(0)) ||
    windowSize.lt(new BN(0)) ||
    windowSize.bitLength() > 256
  ) {
    return;
  }

  return abi.simpleEncode('schedule(address,bytes,uint[8]):(address)', toAddress, callData, [
    callGas,
    callValue,
    windowSize,
    windowStart,
    callGasPrice,
    EAC_SCHEDULING_CONFIG.FEE,
    timeBounty,
    requiredDeposit
  ]);
};

export const parseSchedulingParametersValidity = (isValid: boolean[]) => {
  const Errors = [
    'InsufficientEndowment',
    'ReservedWindowBiggerThanExecutionWindow',
    'InvalidTemporalUnit',
    'ExecutionWindowTooSoon',
    'CallGasTooHigh',
    'EmptyToAddress'
  ];
  const errors: string[] = [];

  isValid.forEach((boolIsTrue, index) => {
    if (!boolIsTrue) {
      errors.push(Errors[index]);
    }
  });

  return errors;
};

export const getValidateRequestParamsData = (
  toAddress: string,
  callData = '',
  callGas: BN,
  callValue: any,
  windowSize: BN | null,
  windowStart: number,
  gasPrice: BN,
  timeBounty: BN,
  requiredDeposit: BN,
  isTimestamp: boolean,
  endowment: BN,
  fromAddress: string
): string => {
  windowSize = windowSize || new BN(0);

  const temporalUnit = isTimestamp ? 2 : 1;
  const freezePeriod = isTimestamp ? 3 * 60 : 10; // 3 minutes or 10 blocks
  const reservedWindowSize = isTimestamp ? 5 * 60 : 16; // 5 minutes or 16 blocks
  const claimWindowSize = isTimestamp ? 60 * 60 : 255; // 60 minutes or 255 blocks
  const feeRecipient = '0x0'; // stub

  return RequestFactory.validateRequestParams.encodeInput({
    _addressArgs: [fromAddress, feeRecipient, toAddress],
    _uintArgs: [
      EAC_SCHEDULING_CONFIG.FEE,
      timeBounty,
      claimWindowSize,
      freezePeriod,
      reservedWindowSize,
      temporalUnit,
      windowSize,
      windowStart,
      callGas,
      callValue,
      gasPrice,
      requiredDeposit
    ],
    _callData: callData,
    _endowment: endowment
  });
};

export const getTXDetailsCheckURL = (txHash: string) => {
  return `${EAC_SCHEDULING_CONFIG.DAPP_ADDRESS}/awaiting/scheduler/${txHash}`;
};

export const getSchedulerAddress = (scheduleType: string | null): Address =>
  Address(
    scheduleType === 'time'
      ? EAC_ADDRESSES.KOVAN.timestampScheduler
      : EAC_ADDRESSES.KOVAN.blockScheduler
  );
