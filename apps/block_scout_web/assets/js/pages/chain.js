import $ from 'jquery'
import omit from 'lodash.omit'
import first from 'lodash.first'
import rangeRight from 'lodash.rangeright'
import find from 'lodash.find'
import map from 'lodash.map'
import humps from 'humps'
import numeral from 'numeral'
import socket from '../socket'
import { updateAllCalculatedUsdValues, formatUsdValue } from '../lib/currency'
import { createStore, connectElements } from '../lib/redux_helpers.js'
import { batchChannel, showLoader } from '../lib/utils'
import listMorph from '../lib/list_morph'
import '../app'

const BATCH_THRESHOLD = 6
const BLOCKS_PER_PAGE = 4

export const initialState = {
  addressCount: null,
  availableSupply: null,
  averageBlockTime: null,
  marketHistoryData: null,
  blocks: [],
  blocksLoading: true,
  blocksError: false,
  transactions: [],
  transactionsBatch: [],
  transactionsError: false,
  transactionsLoading: true,
  transactionCount: null,
  totalGasUsageCount: null,
  usdMarketCap: null,
  blockCount: null
}

export const reducer = withMissingBlocks(baseReducer)

function baseReducer (state = initialState, action) {
  switch (action.type) {
    case 'ELEMENTS_LOAD': {
      return Object.assign({}, state, omit(action, 'type'))
    }
    case 'RECEIVED_NEW_ADDRESS_COUNT': {
      return Object.assign({}, state, {
        addressCount: action.msg.count
      })
    }
    case 'RECEIVED_NEW_BLOCK': {
      if (!state.blocks.length || state.blocks[0].blockNumber < action.msg.blockNumber) {
        let pastBlocks
        if (state.blocks.length < BLOCKS_PER_PAGE) {
          pastBlocks = state.blocks
        } else {
          $('.miner-address-tooltip').tooltip('hide')
          pastBlocks = state.blocks.slice(0, -1)
        }
        return Object.assign({}, state, {
          averageBlockTime: action.msg.averageBlockTime,
          blocks: [
            action.msg,
            ...pastBlocks
          ],
          blockCount: action.msg.blockNumber + 1
        })
      } else {
        return Object.assign({}, state, {
          blocks: state.blocks.map((block) => block.blockNumber === action.msg.blockNumber ? action.msg : block),
          blockCount: action.msg.blockNumber + 1
        })
      }
    }
    case 'START_BLOCKS_FETCH': {
      return Object.assign({}, state, { blocksError: false, blocksLoading: true })
    }
    case 'BLOCKS_FINISH_REQUEST': {
      return Object.assign({}, state, { blocksLoading: false })
    }
    case 'BLOCKS_FETCHED': {
      return Object.assign({}, state, { blocks: [...action.msg.blocks], blocksLoading: false })
    }
    case 'BLOCKS_REQUEST_ERROR': {
      return Object.assign({}, state, { blocksError: true, blocksLoading: false })
    }
    case 'RECEIVED_NEW_EXCHANGE_RATE': {
      return Object.assign({}, state, {
        availableSupply: action.msg.exchangeRate.availableSupply,
        marketHistoryData: action.msg.marketHistoryData,
        usdMarketCap: action.msg.exchangeRate.marketCapUsd
      })
    }
    case 'RECEIVED_NEW_TRANSACTION_BATCH': {
      if (state.channelDisconnected) return state

      const transactionCount = state.transactionCount + action.msgs.length

      if (state.transactionsLoading || state.transactionsError) {
        return Object.assign({}, state, { transactionCount })
      }

      const transactionsLength = state.transactions.length + action.msgs.length
      if (transactionsLength < BATCH_THRESHOLD) {
        return Object.assign({}, state, {
          transactions: [
            ...action.msgs.reverse(),
            ...state.transactions
          ],
          transactionCount
        })
      } else if (!state.transactionsBatch.length && action.msgs.length < BATCH_THRESHOLD) {
        return Object.assign({}, state, {
          transactions: [
            ...action.msgs.reverse(),
            ...state.transactions.slice(0, -1 * action.msgs.length)
          ],
          transactionCount
        })
      } else {
        return Object.assign({}, state, {
          transactionsBatch: [
            ...action.msgs.reverse(),
            ...state.transactionsBatch
          ],
          transactionCount
        })
      }
    }
    case 'TRANSACTION_BATCH_EXPANDED': {
      return Object.assign({}, state, {
        transactionsBatch: []
      })
    }
    case 'RECEIVED_UPDATED_TRANSACTION_STATS': {
      return Object.assign({}, state, {
        transactionStats: action.msg.stats
      })
    }
    case 'START_TRANSACTIONS_FETCH':
      return Object.assign({}, state, { transactionsError: false, transactionsLoading: true })
    case 'TRANSACTIONS_FETCHED':
      return Object.assign({}, state, { transactions: [...action.msg.transactions] })
    case 'TRANSACTIONS_FETCH_ERROR':
      return Object.assign({}, state, { transactionsError: true })
    case 'FINISH_TRANSACTIONS_FETCH':
      return Object.assign({}, state, { transactionsLoading: false })
    default:
      return state
  }
}

function withMissingBlocks (reducer) {
  return (...args) => {
    const result = reducer(...args)

    if (!result.blocks || result.blocks.length < 2) return result

    const maxBlock = first(result.blocks).blockNumber
    const minBlock = maxBlock - (result.blocks.length - 1)

    return Object.assign({}, result, {
      blocks: rangeRight(minBlock, maxBlock + 1)
        .map((blockNumber) => find(result.blocks, ['blockNumber', blockNumber]) || {
          blockNumber,
          chainBlockHtml: placeHolderBlock(blockNumber)
        })
    })
  }
}

let chart
const elements = {
  '[data-chart="historyChart"]': {
    load () {
      chart = window.dashboardChart
    },
    render (_$el, state, oldState) {
      if (!chart || (oldState.availableSupply === state.availableSupply && oldState.marketHistoryData === state.marketHistoryData) || !state.availableSupply) return

      chart.updateMarketHistory(state.availableSupply, state.marketHistoryData)

      if (!chart || (JSON.stringify(oldState.transactionStats) === JSON.stringify(state.transactionStats))) return

      chart.updateTransactionHistory(state.transactionStats)
    }
  },
  '[data-selector="transaction-count"]': {
    load ($el) {
      return { transactionCount: numeral($el.text()).value() }
    },
    render ($el, state, oldState) {
      if (oldState.transactionCount === state.transactionCount) return
      $el.empty().append(numeral(state.transactionCount).format())
    }
  },
  '[data-selector="total-gas-usage"]': {
    load ($el) {
      return { totalGasUsageCount: numeral($el.text()).value() }
    },
    render ($el, state, oldState) {
      if (oldState.totalGasUsageCount === state.totalGasUsageCount) return
      $el.empty().append(numeral(state.totalGasUsageCount).format())
    }
  },
  '[data-selector="block-count"]': {
    load ($el) {
      return { blockCount: numeral($el.text()).value() }
    },
    render ($el, state, oldState) {
      if (oldState.blockCount === state.blockCount) return
      $el.empty().append(numeral(state.blockCount).format())
    }
  },
  '[data-selector="address-count"]': {
    render ($el, state, oldState) {
      if (oldState.addressCount === state.addressCount) return
      $el.empty().append(state.addressCount)
    }
  },
  '[data-selector="average-block-time"]': {
    render ($el, state, oldState) {
      if (oldState.averageBlockTime === state.averageBlockTime) return
      $el.empty().append(state.averageBlockTime)
    }
  },
  '[data-selector="market-cap"]': {
    render ($el, state, oldState) {
      if (oldState.usdMarketCap === state.usdMarketCap) return
      $el.empty().append(formatUsdValue(state.usdMarketCap))
    }
  },
  '[data-selector="tx_per_day"]': {
    render ($el, state, oldState) {
      if (!(JSON.stringify(oldState.transactionStats) === JSON.stringify(state.transactionStats))) {
        $el.empty().append(numeral(state.transactionStats[0].number_of_transactions).format('0,0'))
      }
    }
  },
  '[data-selector="chain-block-list"]': {
    load ($el) {
      return {
        blocksPath: $el[0].dataset.url
      }
    },
    render ($el, state, oldState) {
      if (oldState.blocks === state.blocks) return

      const container = $el[0]

      if (state.blocksLoading === false) {
        const blocks = map(state.blocks, ({ chainBlockHtml }) => $(chainBlockHtml)[0])
        listMorph(container, blocks, { key: 'dataset.blockNumber', horizontal: true })
      }
    }
  },
  '[data-selector="chain-block-list"] [data-selector="error-message"]': {
    render ($el, state, _oldState) {
      if (state.blocksError) {
        $el.show()
      } else {
        $el.hide()
      }
    }
  },
  '[data-selector="chain-block-list"] [data-selector="loading-message"]': {
    render ($el, state, _oldState) {
      showLoader(state.blocksLoading, $el)
    }
  },
  '[data-selector="transactions-list"] [data-selector="error-message"]': {
    render ($el, state, _oldState) {
      $el.toggle(state.transactionsError)
    }
  },
  '[data-selector="transactions-list"] [data-selector="loading-message"]': {
    render ($el, state, _oldState) {
      showLoader(state.transactionsLoading, $el)
    }
  },
  '[data-selector="transactions-list"]': {
    load ($el) {
      return { transactionsPath: $el[0].dataset.transactionsPath }
    },
    render ($el, state, oldState) {
      if (oldState.transactions === state.transactions) return
      const container = $el[0]
      const newElements = map(state.transactions, ({ transactionHtml }) => $(transactionHtml)[0])
      listMorph(container, newElements, { key: 'dataset.identifierHash' })
    }
  },
  '[data-selector="channel-batching-count"]': {
    render ($el, state, _oldState) {
      const $channelBatching = $('[data-selector="channel-batching-message"]')
      if (!state.transactionsBatch.length) return $channelBatching.hide()
      $channelBatching.show()
      $el[0].innerHTML = numeral(state.transactionsBatch.length).format()
    }
  }
}

const $chainDetailsPage = $('[data-page="chain-details"]')
if ($chainDetailsPage.length) {
  const store = createStore(reducer)
  connectElements({ store, elements })

  loadTransactions(store)
  bindTransactionErrorMessage(store)

  loadBlocks(store)
  bindBlockErrorMessage(store)

  const exchangeRateChannel = socket.channel('exchange_rate:new_rate')
  exchangeRateChannel.join()
  exchangeRateChannel.on('new_rate', (msg) => {
    updateAllCalculatedUsdValues(humps.camelizeKeys(msg).exchangeRate.usdValue)
    store.dispatch({
      type: 'RECEIVED_NEW_EXCHANGE_RATE',
      msg: humps.camelizeKeys(msg)
    })
  })

  const addressesChannel = socket.channel('addresses:new_address')
  addressesChannel.join()
  addressesChannel.on('count', msg => store.dispatch({
    type: 'RECEIVED_NEW_ADDRESS_COUNT',
    msg: humps.camelizeKeys(msg)
  }))

  const blocksChannel = socket.channel('blocks:new_block')
  blocksChannel.join()
  blocksChannel.on('new_block', msg => store.dispatch({
    type: 'RECEIVED_NEW_BLOCK',
    msg: humps.camelizeKeys(msg)
  }))

  const transactionsChannel = socket.channel('transactions:new_transaction')
  transactionsChannel.join()
  transactionsChannel.on('transaction', batchChannel((msgs) => store.dispatch({
    type: 'RECEIVED_NEW_TRANSACTION_BATCH',
    msgs: humps.camelizeKeys(msgs)
  })))

  const transactionStatsChannel = socket.channel('transactions:stats')
  transactionStatsChannel.join()
  transactionStatsChannel.on('update', msg => store.dispatch({
    type: 'RECEIVED_UPDATED_TRANSACTION_STATS',
    msg
  }))

  const $txReloadButton = $('[data-selector="reload-transactions-button"]')
  const $channelBatching = $('[data-selector="channel-batching-message"]')
  $txReloadButton.on('click', (event) => {
    event.preventDefault()
    loadTransactions(store)
    $channelBatching.hide()
    store.dispatch({
      type: 'TRANSACTION_BATCH_EXPANDED'
    })
  })
}

function loadTransactions (store) {
  const path = store.getState().transactionsPath
  store.dispatch({ type: 'START_TRANSACTIONS_FETCH' })
  $.getJSON(path)
    .done(response => store.dispatch({ type: 'TRANSACTIONS_FETCHED', msg: humps.camelizeKeys(response) }))
    .fail(() => store.dispatch({ type: 'TRANSACTIONS_FETCH_ERROR' }))
    .always(() => store.dispatch({ type: 'FINISH_TRANSACTIONS_FETCH' }))
}

function bindTransactionErrorMessage (store) {
  $('[data-selector="transactions-list"] [data-selector="error-message"]').on('click', _event => loadTransactions(store))
}

export function placeHolderBlock (blockNumber) {
  return `
    <div
      class="col-lg-3 d-flex fade-up-blocks-chain"
      data-block-number="${blockNumber}"
      data-selector="place-holder"
    >
      <div
        class="tile tile-type-block d-flex align-items-center fade-up demo-blocks"
      >
        <span class="loading-spinner-small ml-1 mr-3">
          <svg width="18" height="19" viewBox="0 0 18 19" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.0585304 7.87003C-0.0132481 8.41763 0.372482 8.91973 0.920082 8.99151C1.46768 9.06329 1.96979 8.67756 2.04157 8.12996L0.0585304 7.87003ZM2.47907 11.63C2.2747 11.1169 1.6931 10.8666 1.18002 11.071C0.666933 11.2753 0.416667 11.8569 0.62103 12.37L2.47907 11.63ZM0.0500488 17C0.0500488 17.5523 0.497764 18 1.05005 18C1.60233 18 2.05005 17.5523 2.05005 17H0.0500488ZM1.05005 12V11C0.497764 11 0.0500488 11.4477 0.0500488 12H1.05005ZM6.05005 13C6.60233 13 7.05005 12.5523 7.05005 12C7.05005 11.4477 6.60233 11 6.05005 11V13ZM2.04157 8.12996C2.49935 4.63754 5.48085 2.02922 9.00313 2.03975L9.00911 0.0397635C4.48047 0.0262225 0.647104 3.37978 0.0585304 7.87003L2.04157 8.12996ZM9.00313 2.03975C12.5254 2.05029 15.4913 4.67639 15.9281 8.17148L17.9127 7.92341C17.351 3.42972 13.5377 0.0533045 9.00911 0.0397635L9.00313 2.03975ZM15.9281 8.17148C16.365 11.6666 14.1369 14.9419 10.7256 15.8192L11.2237 17.7561C15.6096 16.6283 18.4744 12.4171 17.9127 7.92341L15.9281 8.17148ZM10.7256 15.8192C7.31425 16.6964 3.78243 14.9022 2.47907 11.63L0.62103 12.37C2.29679 16.5772 6.83769 18.884 11.2237 17.7561L10.7256 15.8192ZM2.05005 17V12H0.0500488V17H2.05005ZM1.05005 13H6.05005V11H1.05005V13Z" fill="#757F8F"/>
          </svg>
        </span>
        <div>
          <span class="tile-title pr-0 pl-0">${blockNumber}</span>
          <div class="tile-transactions">${window.localized['Block Processing']}</div>
        </div>
      </div>
    </div>
  `
}

function loadBlocks (store) {
  const url = store.getState().blocksPath

  store.dispatch({ type: 'START_BLOCKS_FETCH' })

  $.getJSON(url)
    .done(response => {
      store.dispatch({ type: 'BLOCKS_FETCHED', msg: humps.camelizeKeys(response) })
    })
    .fail(() => store.dispatch({ type: 'BLOCKS_REQUEST_ERROR' }))
    .always(() => store.dispatch({ type: 'BLOCKS_FINISH_REQUEST' }))
}

function bindBlockErrorMessage (store) {
  $('[data-selector="chain-block-list"] [data-selector="error-message"]').on('click', _event => loadBlocks(store))
}
