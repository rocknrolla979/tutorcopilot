import { useState, useEffect, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { ru } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { Clock, Plus, Users, Camera, Minus, Check, X, Trash2, ChevronDown, Calendar } from 'lucide-react'
import './App.css'

const COLORS = ['blue', 'purple', 'amber', 'green']
const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved !== null ? JSON.parse(saved) : initialValue
    } catch {
      return initialValue
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error('Не удалось сохранить', key, e)
    }
  }, [key, value])
  return [value, setValue]
}

function initialsOf(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.trim().slice(0, 2).toUpperCase()
}

function fmtMoney(n) { return Number(n || 0).toLocaleString('ru-RU') }
function groupDigits(raw) {
  const digits = String(raw).replace(/\D/g, '')
  return digits ? Number(digits).toLocaleString('ru-RU') : ''
}
function unformatNum(raw) { return String(raw).replace(/\D/g, '') }

function maskTime(raw) {
  let v = raw.replace(/\D/g, '').slice(0, 4)
  if (v.length >= 1) {
    let h = v.slice(0, 2)
    if (h.length === 2 && Number(h) > 23) h = '23'
    let m = v.slice(2)
    if (m.length === 2 && Number(m) > 59) m = '59'
    v = m.length ? `${h}:${m}` : h
  }
  return v
}

function ymdOf(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
function dateInputValue(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseYMD(s) {
  if (!s) return null
  const [y, m, dd] = s.split('-').map(Number)
  if (!y || !m || !dd) return null
  return new Date(y, m - 1, dd)
}
function fmtDate(d) { return `${d.getDate()} ${MONTHS[d.getMonth()]}` }
function fmtDMY(d) {
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}
function isThisMonth(d, now) {
  return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

// --- Поле даты на react-day-picker ---
function DateField({ value, onChange, className = '', invalid = false }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const selected = parseYMD(value)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const pick = (date) => {
    if (date) onChange(dateInputValue(date))
    setOpen(false)
  }

  return (
    <div className={`datefield-wrap ${className}`} ref={wrapRef}>
      <button type="button" className={`field datefield-btn ${invalid ? 'field-error' : ''}`}
        onClick={() => setOpen(!open)}>
        <span className={selected ? '' : 'muted'}>{selected ? fmtDMY(selected) : 'дд.мм.гггг'}</span>
        <Calendar size={16} className="muted" />
      </button>
      {open && (
        <div className="datepicker-pop">
          <DayPicker
            mode="single"
            locale={ru}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
            selected={selected || undefined}
            defaultMonth={selected || new Date()}
            onSelect={pick}
          />
        </div>
      )}
    </div>
  )
}

function Avatar({ student, size = 40 }) {
  const idx = student._colorIdx || 0
  if (student.photo) {
    return <img className="avatar" src={student.photo} alt=""
      style={{ width: size, height: size, objectFit: 'cover' }} />
  }
  return (
    <div className={`avatar avatar-${COLORS[idx % COLORS.length]}`}
      style={{ width: size, height: size }}>{initialsOf(student.name)}</div>
  )
}

// --- Окно подтверждения (для удаления) ---
function ConfirmDialog({ title, message, confirmLabel = 'Удалить', onConfirm, onCancel }) {
  return (
    <div className="overlay center confirm-over" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <div className="dialog confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-body">
          <p className="confirm-title">{title}</p>
          {message && <p className="confirm-msg">{message}</p>}
          <div className="confirm-actions">
            <button className="ghost-btn" onClick={onCancel}>Отмена</button>
            <button className="danger-btn" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function makeInstance(student, key, date, time, source, exId, handled) {
  return { key, studentId: student.id, date, ymd: ymdOf(date), time, source, exId, rate: student.rate, status: handled[key] }
}

function studentUpcoming(student, fromDate, horizonDays, handled) {
  const id = student.id
  const removed = new Set(student.removed || [])
  const moved = student.moved || {}
  const extra = student.extra || []
  const start = new Date(fromDate); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + horizonDays)
  const out = []

  const d = new Date(start)
  for (let i = 0; i < horizonDays; i++) {
    const ymd = ymdOf(d)
    for (const row of student.schedule) {
      if (WEEKDAYS.indexOf(row.day) !== d.getDay()) continue
      const key = `${id}-${ymd}-${row.time}`
      if (removed.has(key)) continue
      if (moved[key]) continue
      out.push(makeInstance(student, key, new Date(d), row.time, 'schedule', null, handled))
    }
    d.setDate(d.getDate() + 1)
  }
  for (const key of Object.keys(moved)) {
    if (removed.has(key)) continue
    const date = parseYMD(moved[key].date)
    if (!date) continue
    out.push(makeInstance(student, key, date, moved[key].time, 'schedule', null, handled))
  }
  for (const ex of extra) {
    const date = parseYMD(ex.date)
    if (!date) continue
    const key = `${id}-extra-${ex.id}`
    out.push(makeInstance(student, key, date, ex.time, 'extra', ex.id, handled))
  }

  return out
    .filter((x) => x.date >= start && x.date < end)
    .sort((a, b) => {
      const dd = a.date - b.date
      if (dd !== 0) return dd
      return (a.time || '99:99').localeCompare(b.time || '99:99')
    })
}

function nextPaymentInstance(student, fromDate, handled) {
  if (student.rate <= 0) return null
  const list = studentUpcoming(student, fromDate, 366, handled).filter((x) => !x.status)
  const paid = Math.max(0, Math.floor(student.balance / student.rate))
  return list[paid] || null
}

// --- Экран Today ---
function TodayScreen({ students, handled, onDone, onCancel }) {
  const now = new Date()
  const dateStr = `${WEEKDAYS_FULL[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`

  const all = []
  students.forEach((s) => {
    studentUpcoming(s, now, 1, handled).forEach((x) => all.push({ ...x, student: s }))
  })
  const visible = all.filter((l) => !l.status).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  const total = all.filter((l) => l.status !== 'cancelled').reduce((sum, l) => sum + l.rate, 0)

  return (
    <div className="screen">
      <header className="today-header">
        <div>
          <h1 className="today-title">Сегодня</h1>
          <p className="today-date">{dateStr}</p>
        </div>
        <div className="today-income">
          <p className="income-label">за день</p>
          <p className="income-value">{fmtMoney(total)} ₽</p>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="empty">На сегодня уроков нет.</p>
      ) : (
        <div className="cards">
          {visible.map((l) => (
            <div className="lesson-card" key={l.key}>
              <Avatar student={l.student} />
              <div className="lesson-info">
                <p className="lesson-name">{l.student.name}</p>
                <p className="lesson-meta">{l.time} · {fmtMoney(l.rate)} ₽</p>
              </div>
              <button className="round-btn btn-check" onClick={() => onDone(l.studentId, l.key, l.rate)}>
                <Check size={16} />
              </button>
              <button className="round-btn btn-x" onClick={() => onCancel(l.studentId, l.key)}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Экран Mentees ---
function MenteesScreen({ students, handled, topups, onEdit, onTopUp }) {
  const now = new Date()
  let monthlyTotal = 0

  const cards = students.map((s) => {
    const nextInst = nextPaymentInstance(s, now, handled)
    const nextDate = nextInst ? nextInst.date : null
    if (isThisMonth(nextDate, now)) monthlyTotal += s.subscription
    const paidLessons = s.rate > 0 ? Math.max(0, Math.floor(s.balance / s.rate)) : 0
    const lowBalance = s.rate > 0 && nextInst && paidLessons <= 1
    return { s, nextDate, lowBalance }
  })

  // Сумма пополнений, сделанных в этом месяце
  const addedThisMonth = (topups || []).reduce((sum, t) => {
    return isThisMonth(parseYMD(t.date), now) ? sum + t.amount : sum
  }, 0)

  return (
    <div className="screen list-screen">
      <div className="list-scroll">
        <header className="today-header">
          <div>
            <h1 className="today-title">Ученики</h1>
            <p className="today-date">{students.length} в работе</p>
          </div>
        </header>

        {students.length === 0 ? (
          <p className="empty">Пока нет учеников.<br />Добавь во вкладке Add.</p>
        ) : (
          <div className="mentee-list">
            {cards.map(({ s, nextDate, lowBalance }) => (
              <div className={`mentee-card ${lowBalance ? 'mentee-warning' : ''}`} key={s.id}>
                <div className="mentee-top">
                  <Avatar student={s} />
                  <div className="mentee-info">
                    <p className="mentee-name">{s.name}</p>
                    <p className="mentee-sub">Абонемент {fmtMoney(s.subscription)} ₽</p>
                  </div>
                  <div className="mentee-balance">
                    <span className="balance-label">Баланс</span>
                    <span className="balance-value">{fmtMoney(s.balance)} ₽</span>
                  </div>
                </div>
                <div className="mentee-pay">
                  <span className="pay-label">Следующая оплата</span>
                  <span className="pay-date">{nextDate ? fmtDate(nextDate) : '—'}</span>
                </div>
                <div className="mentee-actions">
                  <button className="ghost-btn" onClick={() => onEdit(s)}>Редактировать</button>
                  <button className="ghost-btn" onClick={() => onTopUp(s)}>Пополнить баланс</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mentees-footer">
        <div className="footer-row">
          <span className="footer-label">Возможный заработок</span>
          <span className="footer-value">{fmtMoney(monthlyTotal)} ₽</span>
        </div>
        <div className="footer-row">
          <span className="footer-label">Пополнено в этом месяце</span>
          <span className="footer-value received">{fmtMoney(addedThisMonth)} ₽</span>
        </div>
      </div>
    </div>
  )
}

// --- Окно редактирования ученика ---
function EditModal({ student, handled, onSave, onDelete, onClose }) {
  const [name, setName] = useState(student.name)
  const [photo, setPhoto] = useState(student.photo || null)
  const [rate, setRate] = useState(String(student.rate))
  const [subscription, setSubscription] = useState(String(student.subscription))
  const [schedule, setSchedule] = useState(student.schedule || [])
  const [removed, setRemoved] = useState(student.removed || [])
  const [moved, setMoved] = useState(student.moved || {})
  const [extra, setExtra] = useState(student.extra || [])
  const [showAllUnpaid, setShowAllUnpaid] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [newPerWeek, setNewPerWeek] = useState(2)
  const [newSchedule, setNewSchedule] = useState([{ day: '', time: '' }, { day: '', time: '' }])
  const [newTouched, setNewTouched] = useState(false)
  const [confirm, setConfirm] = useState(null) // null | {type:'student'} | {type:'lesson', inst} | {type:'newschedule'}
  const fileRef = useRef(null)

  const now = new Date()
  const rateNum = Number(rate) || 0
  const working = { ...student, schedule, rate: rateNum, removed, moved, extra }
  const allInstances = studentUpcoming(working, now, 366, handled).filter((x) => !x.status)
  const paidLessons = rateNum > 0 ? Math.max(0, Math.floor(student.balance / rateNum)) : 0
  const paidList = allInstances.slice(0, paidLessons)

  const monthAhead = new Date(now); monthAhead.setDate(monthAhead.getDate() + 31)
  const unpaidAll = allInstances.slice(paidLessons).filter((inst) => inst.date <= monthAhead)
  const unpaidVisible = showAllUnpaid ? unpaidAll : unpaidAll.slice(0, 4)

  const nextInst = allInstances[paidLessons] || null
  const nextInThisMonth = nextInst && isThisMonth(nextInst.date, now)

  const pickPhoto = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result)
    reader.readAsDataURL(file)
  }

  const editDate = (inst, newDateStr) => {
    if (inst.source === 'extra') setExtra(extra.map((e) => (e.id === inst.exId ? { ...e, date: newDateStr } : e)))
    else setMoved({ ...moved, [inst.key]: { date: newDateStr, time: inst.time } })
  }
  const editTime = (inst, newTime) => {
    if (inst.source === 'extra') setExtra(extra.map((e) => (e.id === inst.exId ? { ...e, time: newTime } : e)))
    else setMoved({ ...moved, [inst.key]: { date: dateInputValue(inst.date), time: newTime } })
  }
  const removeLesson = (inst) => {
    if (inst.source === 'extra') setExtra(extra.filter((e) => e.id !== inst.exId))
    else {
      const m = { ...moved }; delete m[inst.key]
      setMoved(m); setRemoved([...removed, inst.key])
    }
  }
  const addExtra = () => {
    setExtra([...extra, { id: Date.now(), date: dateInputValue(now), time: '12:00' }])
  }

  // --- новое регулярное расписание ---
  const decreaseNew = () => {
    if (newPerWeek <= 1) return
    setNewPerWeek(newPerWeek - 1)
    setNewSchedule(newSchedule.slice(0, -1))
  }
  const increaseNew = () => {
    if (newPerWeek >= 7) return
    setNewPerWeek(newPerWeek + 1)
    setNewSchedule([...newSchedule, { day: '', time: '' }])
  }
  const updateNewRow = (i, key, value) => {
    setNewSchedule(newSchedule.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  }
  const startRebuild = () => {
    setNewPerWeek(2)
    setNewSchedule([{ day: '', time: '' }, { day: '', time: '' }])
    setNewTouched(false)
    setRebuilding(true)
  }
  const cancelRebuild = () => {
    setRebuilding(false)
    setNewTouched(false)
  }
  const applyNewSchedule = () => {
    const ok = newSchedule.every((r) => r.day && /^\d{2}:\d{2}$/.test(r.time))
    if (!ok) { setNewTouched(true); return }
    setSchedule(newSchedule.filter((r) => r.day))
    setRemoved([])   // старые исключения ссылаются на прежнее расписание
    setMoved({})     // без очистки moved-уроки остались бы «призраками»
    setRebuilding(false)
    setNewTouched(false)
    setShowAllUnpaid(false)
  }
  const newErr = (cond) => newTouched && cond ? ' field-error' : ''

  const renderRow = (inst, dim) => (
    <div className={`lesson-edit-row ${dim ? 'dimmed' : ''}`} key={inst.key}>
      <DateField className="le-date" value={dateInputValue(inst.date)} onChange={(v) => editDate(inst, v)} />
      <input className="field small le-time" type="text" inputMode="numeric"
        maxLength={5} value={inst.time} onChange={(e) => editTime(inst, maskTime(e.target.value))} />
      {inst.source === 'extra' && <span className="extra-badge">вне</span>}
      <button className="round-btn le-del" onClick={() => setConfirm({ type: 'lesson', inst })}><Trash2 size={15} /></button>
    </div>
  )

  const save = () => {
    if (!name.trim() || !rate) return
    onSave({ ...student, name: name.trim(), photo, rate: rateNum, subscription: Number(subscription) || 0, schedule, removed, moved, extra })
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <span className="add-title">Редактировать</span>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="sheet-scroll">
          <button className="avatar-upload" onClick={() => fileRef.current && fileRef.current.click()}>
            {photo ? <img src={photo} alt="" className="avatar-preview" /> : <Camera size={22} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />

          <label className="field-label">Имя</label>
          <input className="field" type="text" value={name} onChange={(e) => setName(e.target.value)} />

          <label className="field-label">Ставка</label>
          <div className="field field-suffix">
            <input type="text" inputMode="numeric" value={groupDigits(rate)}
              onChange={(e) => setRate(unformatNum(e.target.value))} />
            <span className="suffix">₽ / урок</span>
          </div>

          <label className="field-label">Стоимость регулярного абонемента</label>
          <div className="field field-suffix">
            <input type="text" inputMode="numeric" value={groupDigits(subscription)}
              onChange={(e) => setSubscription(unformatNum(e.target.value))} />
            <span className="suffix">₽</span>
          </div>

          <button className="schedule-toggle" onClick={() => setScheduleOpen(!scheduleOpen)}>
            <span className="schedule-toggle-title">Расписание</span>
            <span className={`chev-circle ${scheduleOpen ? 'open' : ''}`}><ChevronDown size={16} /></span>
          </button>

          {scheduleOpen && (
            <div className="schedule-body">
              {rebuilding ? (
                <>
                  <label className="field-label">Уроков в неделю</label>
                  <div className="stepper">
                    <button className="step-btn" onClick={decreaseNew}><Minus size={14} /></button>
                    <span className="step-value">{newPerWeek}</span>
                    <button className="step-btn" onClick={increaseNew}><Plus size={14} /></button>
                  </div>

                  <p className="field-label accent">Новое расписание</p>
                  {newSchedule.map((row, i) => (
                    <div className="schedule-row" key={i}>
                      <select className={`field small${newErr(!row.day)}`} value={row.day}
                        onChange={(e) => updateNewRow(i, 'day', e.target.value)}>
                        <option value="" disabled>День</option>
                        {WEEKDAYS.slice(1).concat(WEEKDAYS[0]).map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <input className={`field small${newErr(!/^\d{2}:\d{2}$/.test(row.time))}`} type="text"
                        inputMode="numeric" placeholder="13:00" maxLength={5} value={row.time}
                        onChange={(e) => updateNewRow(i, 'time', maskTime(e.target.value))} />
                    </div>
                  ))}
                  {newTouched && !newSchedule.every((r) => r.day && /^\d{2}:\d{2}$/.test(r.time)) &&
                    <p className="form-error">Заполни день и время в каждой строке.</p>}

                  <div className="mentee-actions" style={{ marginTop: 12 }}>
                    <button className="ghost-btn" onClick={cancelRebuild}>Отмена</button>
                    <button className="ghost-btn" onClick={applyNewSchedule}>Применить расписание</button>
                  </div>
                </>
              ) : (
                <>
                  <button className="add-extra-btn" onClick={addExtra}>
                    <Plus size={15} /> Добавить урок вне расписания
                  </button>
                  <button className="new-schedule-btn" onClick={() => setConfirm({ type: 'newschedule' })}>
                    <Calendar size={15} /> Создать новое регулярное расписание
                  </button>

                  <p className="field-label accent">Оплаченные уроки</p>
                  {paidList.length === 0 ? (
                    <p className="hint">Нет оплаченных уроков вперёд (баланс {fmtMoney(student.balance)} ₽).</p>
                  ) : (
                    paidList.map((inst) => renderRow(inst, false))
                  )}

                  {unpaidAll.length > 0 && (
                    <>
                      <p className="field-label section-muted">Неоплаченные · месяц вперёд</p>
                      {unpaidVisible.map((inst) => renderRow(inst, true))}
                      {unpaidAll.length > 4 && (
                        <button className="show-more-btn" onClick={() => setShowAllUnpaid(!showAllUnpaid)}>
                          {showAllUnpaid ? 'Свернуть' : `Показать ещё ${unpaidAll.length - 4}`}
                          <ChevronDown size={15} className={showAllUnpaid ? 'chev-up' : ''} />
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <div className="edit-preview">
            <span className="pay-label">Следующая оплата</span>
            <span className="pay-date">{nextInst ? fmtDate(nextInst.date) : '—'}</span>
          </div>
          {nextInst ? (
            nextInThisMonth && <p className="hint">Попадает в этот месяц — войдёт в заработок месяца.</p>
          ) : (
            <p className="hint">Нет ближайших уроков для расчёта.</p>
          )}

          <button className="delete-student-btn" onClick={() => setConfirm({ type: 'student' })}>
            <Trash2 size={16} /> Удалить ученика
          </button>
        </div>
        <button className="primary-btn" onClick={save}>Сохранить</button>
      </div>

      {confirm && (
        <ConfirmDialog
          title={
            confirm.type === 'student' ? 'Удалить ученика?'
            : confirm.type === 'newschedule' ? 'Создать новое расписание?'
            : 'Удалить урок?'
          }
          message={
            confirm.type === 'student'
              ? `${student.name} и все его данные будут удалены без возможности восстановления.`
              : confirm.type === 'newschedule'
                ? 'Текущее регулярное расписание будет заменено новым. Отдельные переносы и удаления уроков сбросятся. Баланс и пополнения не меняются.'
                : `Урок ${fmtDMY(confirm.inst.date)} в ${confirm.inst.time} будет удалён.`
          }
          confirmLabel={confirm.type === 'newschedule' ? 'Продолжить' : 'Удалить'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.type === 'student') onDelete(student.id)
            else if (confirm.type === 'newschedule') { startRebuild(); setConfirm(null) }
            else { removeLesson(confirm.inst); setConfirm(null) }
          }}
        />
      )}
    </div>
  )
}


// --- Окно пополнения баланса ---
function TopUpModal({ student, onConfirm, onClose }) {
  const [amount, setAmount] = useState(String(student.subscription || ''))
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <span className="add-title">Пополнить баланс</span>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="dialog-body">
          <p className="dialog-sub">{student.name} · баланс {fmtMoney(student.balance)} ₽</p>
          <label className="field-label">Сумма пополнения</label>
          <div className="field field-suffix">
            <input type="text" inputMode="numeric" value={groupDigits(amount)}
              onChange={(e) => setAmount(unformatNum(e.target.value))} />
            <span className="suffix">₽</span>
          </div>
          <button className="primary-btn dialog-confirm" onClick={() => onConfirm(Number(amount) || 0)}>
            Пополнить
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Экран Add ---
function AddScreen({ onAdd }) {
  const [name, setName] = useState('')
  const [photo, setPhoto] = useState(null)
  const [rate, setRate] = useState('')
  const [balance, setBalance] = useState('')
  const [subscription, setSubscription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [perWeek, setPerWeek] = useState(2)
  const [schedule, setSchedule] = useState([{ day: '', time: '' }, { day: '', time: '' }])
  const [touched, setTouched] = useState(false)
  const fileRef = useRef(null)

  const decrease = () => {
    if (perWeek <= 1) return
    setPerWeek(perWeek - 1)
    setSchedule(schedule.slice(0, -1))
  }
  const increase = () => {
    if (perWeek >= 7) return
    setPerWeek(perWeek + 1)
    setSchedule([...schedule, { day: '', time: '' }])
  }
  const updateRow = (i, key, value) => {
    setSchedule(schedule.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  }
  const pickPhoto = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result)
    reader.readAsDataURL(file)
  }

  const scheduleOk = schedule.every((r) => r.day && /^\d{2}:\d{2}$/.test(r.time))
const valid = name.trim() && rate && balance && subscription && startDate && scheduleOk

  const submit = () => {
    if (!valid) { setTouched(true); return }
    onAdd({
      id: Date.now(),
      name: name.trim(),
      photo,
      _colorIdx: Math.floor(Math.random() * COLORS.length),
      rate: Number(rate),
      balance: Number(balance),
      subscription: Number(subscription),
      startDate,
      schedule: schedule.filter((r) => r.day),
      removed: [], moved: {}, extra: [],
    })
    setName(''); setPhoto(null); setRate(''); setBalance(''); setSubscription(''); setStartDate('')
    setPerWeek(2); setSchedule([{ day: '', time: '' }, { day: '', time: '' }]); setTouched(false)
  }

  const err = (cond) => touched && cond ? ' field-error' : ''

  return (
    <div className="screen add-screen">
      <div className="add-scroll">
        <header className="add-header">
          <span className="add-title">Новый ученик</span>
        </header>

        <button className="avatar-upload" onClick={() => fileRef.current && fileRef.current.click()}>
          {photo ? (<img src={photo} alt="" className="avatar-preview" />) : (<span className="avatar-placeholder">
          <Camera size={24} />
          <span className="avatar-plus"><Plus size={11} /></span>
    </span>
  )}
</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />

        <label className="field-label">Имя</label>
        <input className={`field${err(!name.trim())}`} type="text" value={name}
          onChange={(e) => setName(e.target.value)} />

        <label className="field-label">Ставка</label>
        <div className={`field field-suffix${err(!rate)}`}>
          <input type="text" inputMode="numeric" value={groupDigits(rate)}
            onChange={(e) => setRate(unformatNum(e.target.value))} />
          <span className="suffix">₽ / урок</span>
        </div>

        <label className="field-label">Текущий баланс</label>
        <div className={`field field-suffix${err(!balance)}`}>
          <input type="text" inputMode="numeric" value={groupDigits(balance)}
            onChange={(e) => setBalance(unformatNum(e.target.value))} />
          <span className="suffix">₽</span>
        </div>

        <label className="field-label">Стоимость регулярного абонемента</label>
        <div className={`field field-suffix${err(!subscription)}`}>
          <input type="text" inputMode="numeric" value={groupDigits(subscription)}
            onChange={(e) => setSubscription(unformatNum(e.target.value))} />
          <span className="suffix">₽</span>
        </div>

        <div className="two-col">
          <div className="col">
            <label className="field-label">Дата начала</label>
            <DateField value={startDate} onChange={setStartDate} invalid={touched && !startDate} />
          </div>
          <div className="col">
            <label className="field-label">Уроков в неделю</label>
            <div className="stepper">
              <button className="step-btn" onClick={decrease}><Minus size={14} /></button>
              <span className="step-value">{perWeek}</span>
              <button className="step-btn" onClick={increase}><Plus size={14} /></button>
            </div>
          </div>
        </div>

        <p className="field-label accent">Расписание</p>
        {schedule.map((row, i) => (
          <div className="schedule-row" key={i}>
            <select className={`field small${err(!row.day)}`} value={row.day}
              onChange={(e) => updateRow(i, 'day', e.target.value)}>
              <option value="" disabled>День</option>
              {WEEKDAYS.slice(1).concat(WEEKDAYS[0]).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input className={`field small${err(!/^\d{2}:\d{2}$/.test(row.time))}`} type="text" inputMode="numeric"
              placeholder="13:00" maxLength={5} value={row.time}
              onChange={(e) => updateRow(i, 'time', maskTime(e.target.value))} />
          </div>
        ))}

        {touched && !valid && <p className="form-error">Заполни все поля.</p>}
      </div>

      <button className="primary-btn" onClick={submit}>Добавить ученика</button>
    </div>
  )
}

// --- Нижний таб-бар ---
function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'mentees', label: 'Mentees', Icon: Users },
    { id: 'today',   label: 'Today',   Icon: Clock },
    { id: 'add',     label: 'Add',     Icon: Plus },
  ]
  return (
    <nav className="tabbar">
      {tabs.map(({ id, label, Icon }) => (
        <button key={id} className={`tab ${active === id ? 'tab-active' : ''}`}
          onClick={() => onChange(id)}>
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

// --- Главный компонент ---
function App() {
  const [activeTab, setActiveTab] = useState('today')
  const [students, setStudents] = usePersistentState('tc_students', [])
  const [handled, setHandled] = usePersistentState('tc_handled', {})
  const [topups, setTopups] = usePersistentState('tc_topups', [])
  const [editingId, setEditingId] = useState(null)
  const [toppingId, setToppingId] = useState(null)

  const addStudent = (student) => {
    setStudents([...students, student])
    setActiveTab('mentees')
  }
  const markDone = (studentId, lessonKey, rate) => {
    setStudents(students.map((s) => (s.id === studentId ? { ...s, balance: s.balance - rate } : s)))
    setHandled({ ...handled, [lessonKey]: 'done' })
  }
  const markCancelled = (studentId, lessonKey) => {
    setHandled({ ...handled, [lessonKey]: 'cancelled' })
  }
  const saveStudent = (updated) => {
    setStudents(students.map((s) => (s.id === updated.id ? updated : s)))
    setEditingId(null)
  }
  const deleteStudent = (id) => {
    setStudents(students.filter((s) => s.id !== id))
    setEditingId(null)
  }
  const topUp = (amount) => {
    if (amount > 0) {
      setStudents(students.map((s) => (s.id === toppingId ? { ...s, balance: s.balance + amount } : s)))
      setTopups([...topups, { id: Date.now(), studentId: toppingId, amount, date: dateInputValue(new Date()) }])
    }
    setToppingId(null)
  }

  const editingStudent = editingId ? students.find((s) => s.id === editingId) : null
  const toppingStudent = toppingId ? students.find((s) => s.id === toppingId) : null

  return (
    <div className="phone">
      <div className="phone-screen">
        {activeTab === 'mentees' && (
          <MenteesScreen students={students} handled={handled} topups={topups}
            onEdit={(s) => setEditingId(s.id)} onTopUp={(s) => setToppingId(s.id)} />
        )}
        {activeTab === 'today' && (
          <TodayScreen students={students} handled={handled} onDone={markDone} onCancel={markCancelled} />
        )}
        {activeTab === 'add' && <AddScreen onAdd={addStudent} />}
        <TabBar active={activeTab} onChange={setActiveTab} />

        {editingStudent && <EditModal student={editingStudent} handled={handled}
          onSave={saveStudent} onDelete={deleteStudent} onClose={() => setEditingId(null)} />}
        {toppingStudent && <TopUpModal student={toppingStudent} onConfirm={topUp} onClose={() => setToppingId(null)} />}
      </div>
    </div>
  )
}

export default App