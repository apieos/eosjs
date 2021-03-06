const { JsonRpc, RpcError, Api } = require('../../dist')
const { JsSignatureProvider } = require('../../dist/eosjs-jssig')
const fetch = require('node-fetch')
const { TextEncoder, TextDecoder } = require('util')

const privateKey = '5JuH9fCXmU3xbj8nRmhPZaVrxxXrdPaRmZLW1cznNTmTQR2Kg5Z' // replace with "bob" account private key
/* new accounts for testing can be created by unlocking a cleos wallet then calling: 
 * 1) cleos create key --to-console (copy this privateKey & publicKey)
 * 2) cleos wallet import 
 * 3) cleos create account bob publicKey
 * 4) cleos create account alice publicKey
 */

const rpc = new JsonRpc('http://localhost:8888', { fetch })
const signatureProvider = new JsSignatureProvider([privateKey])
const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() })

function waitTwoSeconds() {
  return new Promise(resolve => setTimeout(resolve, 2000));
}

(async () => {
  try {
    const resultWithConfig = await api.transact({
      actions: [{
          account: 'eosio.token',
          name: 'transfer',
          authorization: [{
              actor: 'bob',
              permission: 'active',
          }],
          data: {
              from: 'bob',
              to: 'alice',
              quantity: '0.0001 SYS',
              memo: '',
          },
      }]
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    })
    console.log('\n\nTransaction with configured TAPOS pushed!\n\n' + JSON.stringify(resultWithConfig, null, 2), '\n\n')
    await waitTwoSeconds() // run additional tests after 2 second delay

    const resultWithoutBroadcast = await api.transact({
      actions: [{
          account: 'eosio.token',
          name: 'transfer',
          authorization: [{
              actor: 'bob',
              permission: 'active',
          }],
          data: {
              from: 'bob',
              to: 'alice',
              quantity: '0.0001 SYS',
              memo: '',
          },
      }]
    }, {
      broadcast: false,
      blocksBehind: 3,
      expireSeconds: 30,
    })
    console.log('\n\nTransaction serialized and signed but not pushed!\n\n' + JSON.stringify(resultWithoutBroadcast, null, 2), '\n\n')
    await waitTwoSeconds()

    const broadcastResult = await api.pushSignedTransaction(resultWithoutBroadcast)
    console.log('\n\nSerialized Transaction and signatures pushed!\n\n' + JSON.stringify(broadcastResult, null, 2), '\n\n')
    await waitTwoSeconds()

    const blockInfo = await rpc.get_block(broadcastResult.processed.block_num)
    const currentDate = new Date()
    const timePlusTen = currentDate.getTime() + 10000
    const timeInISOString = (new Date(timePlusTen)).toISOString()
    const expiration = timeInISOString.substr(0, timeInISOString.length - 1)

    const resultWithoutConfig = await api.transact({
      expiration,
      ref_block_num: blockInfo.block_num & 0xffff,
      ref_block_prefix: blockInfo.ref_block_prefix,
      actions: [{
          account: 'eosio.token',
          name: 'transfer',
          authorization: [{
              actor: 'bob',
              permission: 'active',
          }],
          data: {
              from: 'bob',
              to: 'alice',
              quantity: '0.0001 SYS',
              memo: '',
          },
      }]
    })
    console.log('\n\nTransaction with manual TAPOS pushed!\n\n' + JSON.stringify(resultWithoutConfig, null, 2), '\n\n')
  }
  catch(e) {
      throw new Error('Web Integration Test Failed Unexpectedly: ' + e.message)
  }
  await waitTwoSeconds()
  
  let failedAsPlanned;
  try {
    failedAsPlanned = true
    const resultShouldFail = await api.transact({
      actions: [{
          account: 'eosio.token',
          name: 'transfer',
          authorization: [{
              actor: 'bob',
              permission: 'active',
          }],
          data: {
              from: 'bob',
              to: 'alice',
              quantity: '0.0001 SYS',
              memo: '',
          },
      }]
    })
    failedAsPlanned = false
  } catch (e) {
    if (e.message == 'Required configuration or TAPOS fields are not present') {
      console.log('\n\nCaught Exception successfully: \n\n' + e)
    }
    else { failedAsPlanned = false }
  }
  if (!failedAsPlanned) {
      throw new Error('The final transact call (lacking TAPoS and config) did not fail as expected');
  }
  await waitTwoSeconds()
  
  try {
      failedAsPlanned = true
      const invalidRpcCall = await rpc.get_block(-1)
      failedAsPlanned = false
  }
  catch(e) {
      if (e instanceof RpcError) {
          console.log('\n\nCaught RpcError successfully: \n\n' + JSON.stringify(e.json, null, 2), '\n\n')
      }
      else {
          failedAsPlanned = false
      }
  }
  if (!failedAsPlanned) {
      throw new Error('An rpc error is not being thrown for invalid rpc calls')
  }
  await waitTwoSeconds()

})()
