const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const state = {
  baseUrl: '',
  windowYears: 2,
  rawRows: [],
  events: [],
  filteredEvents: [],
  eventsByDate: new Map(),
  currentMonth: startOfMonth(new Date()),
  filters: { search: '', precedence: 'all', minYield: 0 },
  loading: false,
  lastStatus: '',
  timer: null,
  meta: {}
}

const els = {
  base: document.querySelector('#calendar-api-base'),
  windowSelect: document.querySelector('#calendar-window'),
  reload: document.querySelector('#calendar-reload'),
  status: document.querySelector('#calendar-status'),
  search: document.querySelector('#calendar-search'),
  precedence: document.querySelector('#calendar-precedence'),
  minYield: document.querySelector('#calendar-min-yield'),
  clear: document.querySelector('#calendar-clear'),
  exportBtn: document.querySelector('#calendar-export'),
  grid: document.querySelector('#calendar-grid'),
  empty: document.querySelector('#calendar-empty'),
  monthLabel: document.querySelector('#month-label'),
  meta: document.querySelector('#calendar-meta'),
  statEvents: document.querySelector('#stat-events'),
  statPre: document.querySelector('#stat-pre'),
  statPost: document.querySelector('#stat-post'),
  statYield: document.querySelector('#stat-yield'),
  btnPrev: document.querySelector('#btn-prev-month'),
  btnNext: document.querySelector('#btn-next-month'),
  btnToday: document.querySelector('#btn-today'),
  detailShell: document.querySelector('#calendar-detail'),
  detailBackdrop: document.querySelector('#calendar-detail .calendar-detail-backdrop'),
  detailClose: document.querySelector('#calendar-detail .calendar-detail-close'),
  detailDate: document.querySelector('#detail-date'),
  detailTitle: document.querySelector('#detail-title'),
  detailList: document.querySelector('#detail-list')
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function formatYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYmd(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (/^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4))
    const m = Number(raw.slice(4, 6)) - 1
    const d = Number(raw.slice(6, 8))
    return new Date(y, m, d)
  }
  const dt = new Date(raw)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function padStockCode(code) {
  const digits = String(code || '').replace(/\D+/g, '')
  if (!digits) return ''
  return digits.padStart(6, '0')
}

function debounce(fn, wait = 200) {
  let t = null
  return (...args) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

function computeBaseUrl() {
  const direct = (els.base?.value || '').trim()
  if (direct) return direct.replace(/\/$/, '')
  const stored = localStorage.getItem('api_base')
  if (stored) return stored.replace(/\/$/, '')
  const host = location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    const port = location.port === '8001' ? '5001' : '5000'
    return `http://localhost:${port}`
  }
  return ''
}

function saveBaseUrl() {
  const v = (els.base?.value || '').trim()
  if (v) localStorage.setItem('api_base', v)
}

function updateStatus(message) {
  state.lastStatus = message
  if (els.status) els.status.textContent = message
}

function buildEvents(rows) {
  const events = []
  for (const row of rows) {
    if (!row) continue
    if (String(row.is_dividend || '').toUpperCase() !== 'Y') continue
    const stockCode = padStockCode(row.stock_code)
    const corpName = (row.corp_name || '').trim() || '-'
    const ttmYield = typeof row.ttm_yield_pct === 'number' ? row.ttm_yield_pct : null
    const lastYearYield = typeof row.last_year_yield_pct === 'number' ? row.last_year_yield_pct : null
    const ttmDps = typeof row.ttm_dps_sum === 'number' ? row.ttm_dps_sum : null
    const prevDps = typeof row.last_year_dps_sum === 'number' ? row.last_year_dps_sum : null
    const priceNow = typeof row.price_now === 'number' ? row.price_now : null
    const basePrecedenceRaw = (row.last_precedence || '').trim()
    const basePrecedence = basePrecedenceRaw ? basePrecedenceRaw : null
    const rowEvents = Array.isArray(row.events) ? row.events : null

    const pushEvent = ({ recordCandidate, fallbackCandidate, precedence, rcpNo, rcpDate, payDate, boardDate, perShareDividend, kind }) => {
      const source = recordCandidate || fallbackCandidate
      const eventDate = parseYmd(source)
      if (!eventDate) return
      const dateKey = formatYmd(eventDate)
      const dateType = recordCandidate ? 'record' : 'filing'
      events.push({
        id: `${stockCode || corpName}-${rcpNo || dateKey}`,
        date: eventDate,
        dateKey,
        dateType,
        corpName,
        stockCode,
        precedence: precedence || basePrecedence,
        ttmYield,
        lastYearYield,
        ttmDps,
        prevDps,
        priceNow,
        recordDate: recordCandidate || null,
        filingDate: fallbackCandidate || null,
        payDate: payDate || null,
        boardDate: boardDate || null,
        perShareDividend: typeof perShareDividend === 'number' ? perShareDividend : null,
        rcpNo: rcpNo || row.last_rcp_no || null,
        rcpDate: rcpDate || row.last_rcp_dt || null,
        filingsCount: row.count || 0,
        kind: kind || null
      })
    }

    if (rowEvents?.length) {
      rowEvents.forEach(evt => {
        const recordCandidate = evt.record_date || evt.recordDate || row.last_record_date
        const fallbackCandidate = evt.rcp_date || evt.rcpDate || row.last_rcp_dt
        const precedence = evt.precedence || basePrecedence
        pushEvent({
          recordCandidate,
          fallbackCandidate,
          precedence,
          rcpNo: evt.rcp_no || row.last_rcp_no,
          rcpDate: evt.rcp_date || row.last_rcp_dt,
          payDate: evt.pay_date || evt.payDate,
          boardDate: evt.board_date || evt.boardDate,
          perShareDividend: evt.per_share_dividend ?? evt.perShareDividend,
          kind: evt.kind || row.kind
        })
      })
      continue
    }

    const fallbackRecordCandidate = row.last_record_date || row.record_date || row.recordDate
    const fallbackFilingDate = row.last_rcp_dt || row.lastRcpDt
    pushEvent({
      recordCandidate: fallbackRecordCandidate,
      fallbackCandidate: fallbackFilingDate,
      precedence: basePrecedence,
      rcpNo: row.last_rcp_no,
      rcpDate: fallbackFilingDate
    })
  }
  return events.sort((a, b) => a.date - b.date)
}

function applyFilters() {
  const { search, precedence, minYield } = state.filters
  const term = search.trim().toLowerCase()
  const prec = precedence
  const min = Number(minYield) || 0
  const filtered = state.events.filter(event => {
    if (term) {
      const hay = `${event.corpName} ${event.stockCode}`.toLowerCase()
      if (!hay.includes(term)) return false
    }
    if (prec !== 'all') {
      if (prec === 'pre' && event.precedence !== '선배당') return false
      if (prec === 'post' && event.precedence !== '후배당') return false
    }
    if (min > 0) {
      const bestYield = event.ttmYield ?? event.lastYearYield ?? 0
      if (bestYield < min) return false
    }
    return true
  })

  const grouped = new Map()
  for (const ev of filtered) {
    const key = ev.dateKey
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(ev)
  }
  for (const [, list] of grouped.entries()) {
    list.sort((a, b) => {
      const aYield = a.ttmYield ?? a.lastYearYield ?? 0
      const bYield = b.ttmYield ?? b.lastYearYield ?? 0
      if (bYield !== aYield) return bYield - aYield
      return a.corpName.localeCompare(b.corpName, 'ko')
    })
  }
  state.filteredEvents = filtered
  state.eventsByDate = grouped
  render()
}

function formatMonthLabel(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}년 ${m}월`
}

function renderStats() {
  const monthEvents = getEventsForCurrentMonth()
  const total = monthEvents.length
  const pre = monthEvents.filter(ev => ev.precedence === '선배당').length
  const post = monthEvents.filter(ev => ev.precedence === '후배당').length
  const avgYield = monthEvents.length
    ? (monthEvents.reduce((acc, ev) => acc + (ev.ttmYield ?? ev.lastYearYield ?? 0), 0) / monthEvents.length)
    : null
  if (els.statEvents) els.statEvents.textContent = total ? `${total}건` : '0'
  if (els.statPre) els.statPre.textContent = `${pre}건`
  if (els.statPost) els.statPost.textContent = `${post}건`
  if (els.statYield) els.statYield.textContent = avgYield ? `${avgYield.toFixed(2)}%` : '-'
}

function getEventsForCurrentMonth() {
  const y = state.currentMonth.getFullYear()
  const m = state.currentMonth.getMonth()
  return state.filteredEvents.filter(ev => ev.date.getFullYear() === y && ev.date.getMonth() === m)
}

function renderCalendar() {
  if (!els.grid) return
  const fragment = document.createDocumentFragment()
  els.grid.innerHTML = ''
  for (const label of WEEKDAYS) {
    const dayEl = document.createElement('div')
    dayEl.className = 'calendar-weekday'
    dayEl.textContent = label
    fragment.appendChild(dayEl)
  }
  const firstDay = startOfMonth(state.currentMonth)
  const firstWeekday = firstDay.getDay()
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstWeekday)
  for (let i = 0; i < 42; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const cell = document.createElement('div')
    cell.className = 'calendar-day'
    if (date.getMonth() !== state.currentMonth.getMonth()) cell.classList.add('other-month')
    const isToday = sameDay(date, new Date())
    if (isToday) cell.classList.add('today')
    const header = document.createElement('div')
    header.className = 'calendar-day-header'
    const dayNum = document.createElement('span')
    dayNum.textContent = String(date.getDate())
    header.appendChild(dayNum)
    const count = document.createElement('span')
    const key = formatYmd(date)
    const dayEvents = state.eventsByDate.get(key) || []
    if (dayEvents.length) {
      count.textContent = `${dayEvents.length}`
      count.className = 'muted'
    }
    header.appendChild(count)
    cell.appendChild(header)
    if (dayEvents.length) {
      const max = 3
      dayEvents.slice(0, max).forEach(ev => {
        cell.appendChild(renderEventChip(ev, dayEvents))
      })
      if (dayEvents.length > max) {
        const more = document.createElement('button')
        more.type = 'button'
        more.className = 'event-more'
        more.textContent = `+${dayEvents.length - max} more`
        more.addEventListener('click', () => openDetail(key, dayEvents))
        cell.appendChild(more)
      }
    }
    fragment.appendChild(cell)
  }
  els.grid.appendChild(fragment)
  const monthEvents = getEventsForCurrentMonth()
  if (els.empty) els.empty.style.display = monthEvents.length ? 'none' : 'block'
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function renderEventChip(event, dayEvents) {
  const btn = document.createElement('button')
  btn.type = 'button'
  const badgeClass = event.precedence === '선배당' ? 'pre' : event.precedence === '후배당' ? 'post' : ''
  btn.className = `event-chip ${badgeClass}`.trim()
  const name = document.createElement('span')
  name.textContent = `${event.corpName}`
  const yieldEl = document.createElement('span')
  yieldEl.className = 'yield'
  const val = event.ttmYield ?? event.lastYearYield
  if (val != null) {
    yieldEl.textContent = `${val.toFixed(1)}%`
  } else {
    yieldEl.textContent = ''
  }
  btn.appendChild(name)
  btn.appendChild(yieldEl)
  btn.addEventListener('click', () => openDetail(event.dateKey, dayEvents))
  return btn
}

function renderMeta() {
  if (!els.meta) return
  const total = state.events.length
  const from = state.meta.from ? state.meta.from : ''
  const to = state.meta.to ? state.meta.to : ''
  const asOf = state.meta.as_of ? state.meta.as_of : ''
  const range = from && to ? `${from} ~ ${to}` : ''
  const pieces = []
  if (asOf) pieces.push(`기준일 ${asOf}`)
  if (range) pieces.push(`스캔 범위 ${range}`)
  pieces.push(`총 ${total}건`)
  els.meta.textContent = pieces.join(' · ')
}

function render() {
  if (els.monthLabel) els.monthLabel.textContent = formatMonthLabel(state.currentMonth)
  renderCalendar()
  renderStats()
  renderMeta()
}

async function fetchData() {
  if (state.loading) return
  state.baseUrl = computeBaseUrl()
  saveBaseUrl()
  const url = `${state.baseUrl}/api/scans/dividends/kospi?years=${state.windowYears}`
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  updateStatus('데이터를 불러오는 중입니다…')
  state.loading = true
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 202) {
      const retryAfter = Number(res.headers.get('Retry-After') || '3')
      const body = await res.json().catch(() => ({}))
      updateStatus(body?.message || '스캔을 시작했습니다. 잠시 후 다시 시도합니다.')
      state.timer = setTimeout(() => fetchData(), Math.min(retryAfter, 10) * 1000)
      return
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = await res.json()
    state.rawRows = payload.rows || []
    state.meta = {
      as_of: payload.as_of,
      from: payload.from,
      to: payload.to,
      duration: payload.duration_ms,
      count: payload.count
    }
    state.events = buildEvents(state.rawRows)
    applyFilters()
    updateStatus(`총 ${state.events.length}건의 배당 기준일이 로드되었습니다.`)
  } catch (err) {
    console.error(err)
    updateStatus(`데이터를 불러오는 중 오류가 발생했습니다: ${err.message}`)
  } finally {
    state.loading = false
  }
}

function resetFilters() {
  state.filters = { search: '', precedence: 'all', minYield: 0 }
  if (els.search) els.search.value = ''
  if (els.precedence) els.precedence.value = 'all'
  if (els.minYield) els.minYield.value = '0'
  applyFilters()
}

function exportCurrentMonthCsv() {
  const monthEvents = getEventsForCurrentMonth()
  if (!monthEvents.length) {
    alert('현재 월에 내보낼 데이터가 없습니다.')
    return
  }
  const header = ['recordDate', 'corpName', 'stockCode', 'precedence', 'payDate', 'boardDate', 'perShareDividend', 'ttmYield', 'lastYearYield', 'ttmDps', 'prevDps', 'priceNow', 'rcpNo', 'rcpDate', 'dateType']
  const lines = [header.join(',')]
  for (const ev of monthEvents) {
    const row = [
      ev.dateKey,
      `"${ev.corpName.replace(/"/g, '""')}"`,
      ev.stockCode,
      ev.precedence || '',
      ev.payDate || '',
      ev.boardDate || '',
      ev.perShareDividend ?? '',
      ev.ttmYield ?? '',
      ev.lastYearYield ?? '',
      ev.ttmDps ?? '',
      ev.prevDps ?? '',
      ev.priceNow ?? '',
      ev.rcpNo ?? '',
      ev.rcpDate ?? '',
      ev.dateType
    ]
    lines.push(row.join(','))
  }
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const stamp = `${state.currentMonth.getFullYear()}${String(state.currentMonth.getMonth() + 1).padStart(2, '0')}`
  const a = document.createElement('a')
  a.href = url
  a.download = `dividend-calendar-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function openDetail(dateKey, dayEvents) {
  if (!els.detailShell || !els.detailList) return
  const displayDate = new Date(dateKey)
  const primaryType = dayEvents[0]?.dateType === 'filing' ? '공시일' : '배당 기준일'
  els.detailDate.textContent = `${primaryType} ${formatYmd(displayDate)}`
  els.detailTitle.textContent = `해당 날짜 배당 이벤트 ${dayEvents.length}건`
  els.detailList.innerHTML = ''
  dayEvents.forEach(ev => {
    els.detailList.appendChild(renderDetailCard(ev))
  })
  els.detailShell.classList.add('active')
  els.detailShell.setAttribute('aria-hidden', 'false')
}

function closeDetail() {
  if (!els.detailShell) return
  els.detailShell.classList.remove('active')
  els.detailShell.setAttribute('aria-hidden', 'true')
}

function renderDetailCard(ev) {
  const card = document.createElement('div')
  card.className = 'detail-card'
  const header = document.createElement('div')
  header.className = 'detail-card-header'
  const title = document.createElement('h3')
  title.textContent = `${ev.corpName} (${ev.stockCode || '-'})`
  const badge = document.createElement('span')
  const badgeKind = ev.precedence === '선배당' ? 'pre' : ev.precedence === '후배당' ? 'post' : ''
  badge.className = `badge ${badgeKind}`.trim()
  badge.textContent = ev.precedence || '정보 없음'
  header.appendChild(title)
  header.appendChild(badge)
  card.appendChild(header)

  const grid = document.createElement('div')
  grid.className = 'detail-grid'
  const dateLabel = ev.dateType === 'filing' ? '공시일' : '배당 기준일'
  grid.appendChild(detailField(dateLabel, formatDisplayDate(ev.dateKey)))
  grid.appendChild(detailField('지급일', formatDisplayDate(ev.payDate)))
  const exDateSource = ev.recordDate || (ev.dateType === 'record' ? ev.dateKey : null)
  grid.appendChild(detailField('배당락일', formatDisplayDate(exDateSource)))
  grid.appendChild(detailField('1주당 배당금', ev.perShareDividend != null ? `${formatNumber(ev.perShareDividend)}원` : '-'))
  grid.appendChild(detailField('TTM 수익률', ev.ttmYield != null ? `${ev.ttmYield.toFixed(2)}%` : '-'))
  grid.appendChild(detailField('직전연도 수익률', ev.lastYearYield != null ? `${ev.lastYearYield.toFixed(2)}%` : '-'))
  grid.appendChild(detailField('TTM DPS (원)', ev.ttmDps != null ? ev.ttmDps.toLocaleString('ko-KR') : '-'))
  grid.appendChild(detailField('전년도 DPS (원)', ev.prevDps != null ? ev.prevDps.toLocaleString('ko-KR') : '-'))
  grid.appendChild(detailField('현재가 (원)', ev.priceNow != null ? ev.priceNow.toLocaleString('ko-KR') : '-'))
  card.appendChild(grid)

  const actions = document.createElement('div')
  actions.className = 'detail-actions'
  if (ev.rcpNo) {
    const link = document.createElement('a')
    link.href = `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(ev.rcpNo)}`
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'DART 상세 보기'
    actions.appendChild(link)
  }
  const corpLink = document.createElement('a')
  corpLink.href = `./corp.html?code=${encodeURIComponent(ev.stockCode)}`
  corpLink.textContent = '종목 상세'
  actions.appendChild(corpLink)
  card.appendChild(actions)
  return card
}

function detailField(label, value) {
  const wrap = document.createElement('span')
  const title = document.createElement('strong')
  title.textContent = label.toUpperCase()
  const val = document.createElement('span')
  val.textContent = value ?? '-'
  wrap.appendChild(title)
  wrap.appendChild(val)
  return wrap
}

function initInputs() {
  if (els.base) {
    const initial = computeBaseUrl()
    els.base.value = initial
    els.base.addEventListener('change', () => {
      saveBaseUrl()
      fetchData()
    })
  }
  if (els.windowSelect) {
    els.windowSelect.value = String(state.windowYears)
    els.windowSelect.addEventListener('change', () => {
      state.windowYears = Number(els.windowSelect.value) || 1
      fetchData()
    })
  }
  if (els.reload) {
    els.reload.addEventListener('click', () => fetchData())
  }
  if (els.search) {
    els.search.addEventListener('input', debounce((e) => {
      state.filters.search = e.target.value || ''
      applyFilters()
    }, 250))
  }
  if (els.precedence) {
    els.precedence.addEventListener('change', () => {
      state.filters.precedence = els.precedence.value
      applyFilters()
    })
  }
  if (els.minYield) {
    els.minYield.addEventListener('input', () => {
      state.filters.minYield = Number(els.minYield.value) || 0
      applyFilters()
    })
  }
  if (els.clear) {
    els.clear.addEventListener('click', resetFilters)
  }
  if (els.exportBtn) {
    els.exportBtn.addEventListener('click', exportCurrentMonthCsv)
  }
  if (els.btnPrev) {
    els.btnPrev.addEventListener('click', () => {
      const d = new Date(state.currentMonth)
      d.setMonth(d.getMonth() - 1)
      state.currentMonth = startOfMonth(d)
      render()
    })
  }
  if (els.btnNext) {
    els.btnNext.addEventListener('click', () => {
      const d = new Date(state.currentMonth)
      d.setMonth(d.getMonth() + 1)
      state.currentMonth = startOfMonth(d)
      render()
    })
  }
  if (els.btnToday) {
    els.btnToday.addEventListener('click', () => {
      state.currentMonth = startOfMonth(new Date())
      render()
    })
  }
  if (els.detailBackdrop) {
    els.detailBackdrop.addEventListener('click', closeDetail)
  }
  if (els.detailClose) {
    els.detailClose.addEventListener('click', closeDetail)
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeDetail()
  })
}

function init() {
  initInputs()
  if (!bootstrapFromPreloaded()) {
    fetchData()
  }
}

init()

function bootstrapFromPreloaded() {
  const preRows = Array.isArray(window.__CALENDAR_ROWS__) ? window.__CALENDAR_ROWS__ : null
  if (!preRows || !preRows.length) return false
  state.rawRows = preRows
  state.meta = window.__CALENDAR_META__ || {}
  state.events = buildEvents(state.rawRows)
  applyFilters()
  updateStatus(`총 ${state.events.length}건의 배당 기준일이 로드되었습니다. (static)`)
  return true
}

function formatDisplayDate(raw) {
  if (!raw) return '-'
  const dt = parseYmd(raw)
  return dt ? formatYmd(dt) : raw
}

function formatNumber(value, fractionDigits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: fractionDigits })
}
