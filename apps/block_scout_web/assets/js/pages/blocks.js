import $ from 'jquery'
import omit from 'lodash.omit'
import last from 'lodash.last'
import min from 'lodash.min'
import max from 'lodash.max'
import keys from 'lodash.keys'
import rangeRight from 'lodash.rangeright'
import humps from 'humps'
import socket from '../socket'
import { connectElements } from '../lib/redux_helpers.js'
import { createAsyncLoadStore } from '../lib/async_listing_load'
import '../app'

export const initialState = {
  channelDisconnected: false
}

export const blockReducer = withMissingBlocks(baseReducer)

function baseReducer (state = initialState, action) {
  switch (action.type) {
    case 'ELEMENTS_LOAD': {
      return Object.assign({}, state, omit(action, 'type'))
    }
    case 'CHANNEL_DISCONNECTED': {
      return Object.assign({}, state, {
        channelDisconnected: true
      })
    }
    case 'RECEIVED_NEW_BLOCK': {
      if (state.channelDisconnected || state.beyondPageOne || state.blockType !== 'block') return state

      const blockNumber = getBlockNumber(action.msg.blockHtml)
      const minBlock = getBlockNumber(last(state.items))

      if (state.items.length && blockNumber < minBlock) return state

      return Object.assign({}, state, {
        items: [action.msg.blockHtml, ...state.items]
      })
    }
    default:
      return state
  }
}

const elements = {
  '[data-selector="channel-disconnected-message"]': {
    render ($el, state) {
      if (state.channelDisconnected && !window.loading) $el.show()
    }
  }
}

function getBlockNumber (blockHtml) {
  return $(blockHtml).data('blockNumber')
}

function withMissingBlocks (reducer) {
  return (...args) => {
    const result = reducer(...args)

    if (result.items.length < 2) return result

    const blockNumbersToItems = result.items.reduce((acc, item) => {
      const blockNumber = getBlockNumber(item)
      acc[blockNumber] = acc[blockNumber] || item
      return acc
    }, {})

    const blockNumbers = keys(blockNumbersToItems).map(x => parseInt(x, 10))
    const minBlock = min(blockNumbers)
    const maxBlock = max(blockNumbers)

    return Object.assign({}, result, {
      items: rangeRight(minBlock, maxBlock + 1)
        .map((blockNumber) => blockNumbersToItems[blockNumber] || placeHolderBlock(blockNumber))
    })
  }
}

const $blockListPage = $('[data-page="block-list"]')
const $uncleListPage = $('[data-page="uncle-list"]')
const $reorgListPage = $('[data-page="reorg-list"]')
if ($blockListPage.length || $uncleListPage.length || $reorgListPage.length) {
  window.onbeforeunload = () => {
    window.loading = true
  }

  const blockType = $blockListPage.length ? 'block' : $uncleListPage.length ? 'uncle' : 'reorg'

  const store = createAsyncLoadStore(
    $blockListPage.length ? blockReducer : baseReducer,
    Object.assign({}, initialState, { blockType }),
    'dataset.blockNumber'
  )
  connectElements({ store, elements })

  const blocksChannel = socket.channel('blocks:new_block', {})
  blocksChannel.join()
  blocksChannel.onError(() => store.dispatch({
    type: 'CHANNEL_DISCONNECTED'
  }))
  blocksChannel.on('new_block', (msg) => store.dispatch({
    type: 'RECEIVED_NEW_BLOCK',
    msg: humps.camelizeKeys(msg)
  }))
}

export function placeHolderBlock (blockNumber) {
  return `
    <div class="my-3" data-selector="place-holder" data-block-number="${blockNumber}">
      <div
        class="tile tile-type-block d-flex align-items-center fade-up"
        style="min-height: 90px;"
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
