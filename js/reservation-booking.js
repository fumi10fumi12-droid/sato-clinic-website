(() => {
  const departments = ['内科', '循環器科', '呼吸器科', '予防医療・健康診断', '生活習慣病'];
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const times = [];
  for (const [start, end] of [[9, 12], [13, 18]]) {
    for (let minute = start * 60; minute < end * 60; minute += 30) {
      times.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
    }
  }
  function tokyoNow(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type) => parts.find((item) => item.type === type).value;
    return {date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}`};
  }
  const asDate = (key) => new Date(`${key}T00:00:00Z`);
  const dateKey = (date) => date.toISOString().slice(0, 10);
  function weekDates(offset = 0, now = new Date()) {
    const first = asDate(tokyoNow(now).date);
    first.setUTCDate(first.getUTCDate() + Math.max(0, offset));
    return Array.from({length: 7}, (_, i) => {
      const day = new Date(first);
      day.setUTCDate(day.getUTCDate() + i);
      return dateKey(day);
    });
  }
  function slotStatus(date, time, department, now = new Date()) {
    if (!departments.includes(department) || !times.includes(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'closed';
    const day = asDate(date);
    if (!Number.isFinite(day.getTime()) || dateKey(day) !== date) return 'closed';
    const today = tokyoNow(now);
    const weekday = day.getUTCDay();
    if (date < today.date || (date === today.date && time <= today.time) || weekday === 0 || weekday === 4 || (weekday === 6 && time >= '12:00')) return 'closed';
    // 操作確認用の固定サンプル。実際の予約状況や患者情報は取得しません。
    const seed = Array.from(`${department}:${date}:${time}`).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 100003, 0) % 11;
    return seed < 2 ? 'full' : seed < 4 ? 'limited' : 'available';
  }
  const selectable = (status) => status === 'available' || status === 'limited';
  const dateLabel = (key) => {
    const date = asDate(key);
    return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日（${weekdays[date.getUTCDay()]}）`;
  };
  // 日付・休診日・空き枠の判定をブラウザー以外でも検証可能にします。
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {departments, times, tokyoNow, weekDates, slotStatus, selectable};
    return;
  }
  const launchForms = document.querySelectorAll('form.reservation-preview');
  if (!launchForms.length) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'booking-dialog';
  dialog.setAttribute('aria-labelledby', 'booking-title');
  dialog.setAttribute('aria-describedby', 'booking-sample-note');
  dialog.innerHTML = `
    <header class="booking-dialog-header"><span>佐藤医院</span><button type="button" class="booking-close" aria-label="予約画面を閉じる">×</button></header>
    <div class="booking-dialog-body">
      <ol class="booking-progress" aria-label="ご予約の手順"><li><b>1</b><span>日時</span></li><li><b>2</b><span>予約者情報</span></li><li><b>3</b><span>確認</span></li></ol>
      <h2 id="booking-title" tabindex="-1">日時</h2>
      <p id="booking-sample-note" class="booking-sample-note">空き状況は操作確認用の見本です。実際の予約は登録されません。</p>
      <form class="booking-wizard" novalidate>
        <input type="hidden" name="department">
        <input type="hidden" name="visit">
        <section data-booking-step="0" aria-label="日時の選択">
          <p class="booking-menu-summary"></p>
          <h3>ご希望の日時をお選びください</h3>
          <div class="booking-week-nav"><button type="button" data-week="-7">‹ 前の週</button><strong class="booking-date-range"></strong><button type="button" data-week="7">次の週 ›</button><button type="button" class="booking-today">本日</button></div>
          <div class="booking-table-scroll" tabindex="0" role="region" aria-label="予約可能な日時の一覧"><table class="booking-availability"><caption>予約可能な日時（見本）</caption><thead></thead><tbody></tbody></table></div>
          <p class="booking-legend"><span>○ 空きあり</span><span>△ 残りわずか</span><span>× 予約不可</span><span>― 休診・受付外</span></p>
          <p class="booking-selected" role="status" aria-live="polite">ご希望の日時を選択してください。</p>
        </section>
        <section data-booking-step="1" aria-label="予約者情報" hidden>
          <p class="booking-patient-summary"></p>
          <h3>予約者情報をご入力ください</h3>
          <label class="booking-field"><span>診察券番号 <small>任意</small></span><input name="patient_id" type="text" maxlength="40" placeholder="お持ちの方のみご入力ください"></label>
          <div class="booking-name-pair"><label class="booking-field"><span>姓 <em>必須</em></span><input name="family_name" autocomplete="family-name" required maxlength="50" placeholder="佐藤"></label><label class="booking-field"><span>名 <em>必須</em></span><input name="given_name" autocomplete="given-name" required maxlength="50" placeholder="太郎"></label></div>
          <div class="booking-name-pair"><label class="booking-field"><span>セイ <em>必須</em></span><input name="family_kana" required maxlength="50" placeholder="サトウ"></label><label class="booking-field"><span>メイ <em>必須</em></span><input name="given_kana" required maxlength="50" placeholder="タロウ"></label></div>
          <label class="booking-field"><span>電話番号 <em>必須</em></span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20" placeholder="090-1234-5678"></label>
          <label class="booking-field"><span>メールアドレス <small>任意</small></span><input name="email" type="email" autocomplete="email" maxlength="254" placeholder="例：taro@example.com"></label>
          <p class="booking-help">入力内容はこの画面内でのみ使用され、送信・保存されません。</p>
        </section>
        <section data-booking-step="2" aria-label="内容の確認" hidden>
          <h3>ご予約内容をご確認ください</h3><dl class="booking-review"></dl>
          <p class="booking-help">内容を修正する場合は「戻る」を押してください。</p>
        </section>
        <p class="booking-error" role="alert" hidden></p>
        <div class="booking-actions"><button type="button" class="booking-back">戻る</button><button type="submit" class="booking-next">次へ</button></div>
      </form>
      <section class="booking-finished" hidden><div class="booking-finished-icon" aria-hidden="true">✓</div><h3>入力内容の確認が完了しました</h3><p>実際の予約は登録されていません。<br>受診のご予約はお電話でお問い合わせください。</p><button type="button" class="booking-finish-close">閉じる</button></section>
    </div>`;
  document.body.append(dialog);
  const wizard = dialog.querySelector('.booking-wizard');
  const field = (name) => wizard.elements.namedItem(name);
  const panels = [...dialog.querySelectorAll('[data-booking-step]')];
  const progress = [...dialog.querySelectorAll('.booking-progress li')];
  const title = dialog.querySelector('#booking-title');
  const next = dialog.querySelector('.booking-next');
  const back = dialog.querySelector('.booking-back');
  const error = dialog.querySelector('.booking-error');
  const finished = dialog.querySelector('.booking-finished');
  let state = null;
  let origin = null;
  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }
  function selectedText() {
    return state.selected ? `${dateLabel(state.selected.date)} ${state.selected.time}` : 'ご希望の日時を選択してください。';
  }
  function updateSelection() {
    dialog.querySelector('.booking-selected').textContent = selectedText();
    wizard.querySelectorAll('[data-slot-date]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.slotDate === state.selected?.date && button.dataset.slotTime === state.selected?.time));
    });
    next.disabled = !state.selected;
  }
  function renderWeek() {
    const dates = weekDates(state.offset);
    const first = asDate(dates[0]);
    const last = asDate(dates[6]);
    dialog.querySelector('.booking-date-range').textContent = `${first.getUTCFullYear()}年${first.getUTCMonth() + 1}月${first.getUTCDate()}日 〜 ${last.getUTCMonth() + 1}月${last.getUTCDate()}日`;
    dialog.querySelector('[data-week="-7"]').disabled = state.offset === 0;
    dialog.querySelector('.booking-menu-summary').textContent = `予約内容：${field('department').value} ／ ${field('visit').value}`;
    const table = dialog.querySelector('.booking-availability');
    const heading = document.createElement('tr');
    const timeHeading = document.createElement('th');
    timeHeading.scope = 'col';
    timeHeading.textContent = '時間';
    heading.append(timeHeading);
    dates.forEach((key) => {
      const day = asDate(key);
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = `${day.getUTCMonth() + 1}/${day.getUTCDate()}（${weekdays[day.getUTCDay()]}）`;
      if (day.getUTCDay() === 0) th.className = 'booking-sunday';
      if (day.getUTCDay() === 6) th.className = 'booking-saturday';
      heading.append(th);
    });
    table.tHead.replaceChildren(heading);
    const rows = times.map((time) => {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = time;
      row.append(th);
      dates.forEach((date) => {
        const td = document.createElement('td');
        const status = slotStatus(date, time, field('department').value);
        if (selectable(status)) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'booking-slot';
          button.textContent = status === 'limited' ? '△' : '○';
          button.dataset.slotDate = date;
          button.dataset.slotTime = time;
          button.setAttribute('aria-label', `${dateLabel(date)} ${time} ${status === 'limited' ? '残りわずか' : '空きあり'}（見本）`);
          button.addEventListener('click', () => {
            if (!selectable(slotStatus(date, time, field('department').value))) {
              showError('この時間は選択できません。別の日時をお選びください。');
              renderWeek();
              return;
            }
            state.selected = {date, time};
            showError('');
            updateSelection();
          });
          td.append(button);
        } else {
          td.className = 'booking-unavailable';
          const mark = document.createElement('span');
          mark.textContent = status === 'full' ? '×' : '―';
          mark.setAttribute('aria-label', status === 'full' ? '予約不可（見本）' : '休診・受付外');
          td.append(mark);
        }
        row.append(td);
      });
      return row;
    });
    table.tBodies[0].replaceChildren(...rows);
    updateSelection();
  }
  function renderReview() {
    const values = [
      ['診療科目', field('department').value], ['受診区分', field('visit').value],
      ['ご予約日時', selectedText()], ['お名前', `${field('family_name').value.trim()} ${field('given_name').value.trim()}`],
      ['フリガナ', `${field('family_kana').value.trim()} ${field('given_kana').value.trim()}`],
      ['電話番号', field('phone').value.trim()], ['メールアドレス', field('email').value.trim() || '未入力'],
      ['診察券番号', field('patient_id').value.trim() || '未入力'],
    ];
    dialog.querySelector('.booking-review').replaceChildren(...values.map(([label, value]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      row.append(term, description);
      return row;
    }));
  }
  function showStep(step) {
    state.step = step;
    showError('');
    wizard.hidden = false;
    finished.hidden = true;
    panels.forEach((panel, i) => { panel.hidden = i !== step; });
    progress.forEach((item, i) => {
      if (i === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.classList.toggle('is-complete', i < step);
    });
    title.textContent = ['日時', '予約者情報', '内容の確認'][step];
    next.textContent = step === 2 ? 'この内容で確認を完了する' : step === 1 ? '確認画面へ' : '次へ';
    next.disabled = step === 0 && !state.selected;
    back.hidden = step === 0;
    if (step === 0) renderWeek();
    if (step === 1) dialog.querySelector('.booking-patient-summary').textContent = `${field('department').value} ／ ${selectedText()}`;
    if (step === 2) renderReview();
    dialog.scrollTop = 0;
    title.focus({preventScroll: true});
  }
  function validSelection() {
    return state.selected && selectable(slotStatus(state.selected.date, state.selected.time, field('department').value));
  }
  wizard.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.step === 0) {
      if (!validSelection()) {
        state.selected = null;
        renderWeek();
        showError('ご希望の日時を空き枠から選択してください。');
        return;
      }
      showStep(1);
    } else if (state.step === 1) {
      for (const input of panels[1].querySelectorAll('input')) {
        input.setCustomValidity(input.required && !input.value.trim() ? '入力してください。' : '');
        if (input.name === 'phone' && input.value.trim()) {
          const phone = input.value.replace(/[\s()＋+－ー-]/g, '');
          input.setCustomValidity(/^\d{10,11}$/.test(phone) ? '' : '電話番号を10〜11桁の数字で入力してください。');
        }
        if (!input.reportValidity()) return;
      }
      showStep(2);
    } else {
      if (!validSelection()) {
        state.selected = null;
        showStep(0);
        showError('選択した時間が過ぎています。別の日時をお選びください。');
        return;
      }
      wizard.hidden = true;
      finished.hidden = false;
      title.textContent = '入力内容の確認';
      title.focus({preventScroll: true});
      dialog.scrollTop = 0;
    }
  });
  wizard.addEventListener('input', (event) => {
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
  });
  back.addEventListener('click', () => showStep(Math.max(0, state.step - 1)));
  dialog.querySelectorAll('[data-week]').forEach((button) => {
    button.addEventListener('click', () => {
      state.offset = Math.max(0, state.offset + Number(button.dataset.week));
      renderWeek();
    });
  });
  dialog.querySelector('.booking-today').addEventListener('click', () => { state.offset = 0; renderWeek(); });
  dialog.querySelector('.booking-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.booking-finish-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    wizard.reset();
    wizard.querySelectorAll('input').forEach((input) => input.setCustomValidity(''));
    dialog.querySelector('.booking-review').replaceChildren();
    state = null;
    origin?.querySelector('button[type="submit"]')?.focus({preventScroll: true});
  });
  launchForms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const department = form.elements.namedItem('department');
      if (!departments.includes(department.value)) {
        department.reportValidity();
        return;
      }
      origin = form;
      state = {step: 0, offset: 0, selected: null};
      field('department').value = department.value;
      field('visit').value = form.elements.namedItem('visit').value;
      dialog.showModal();
      showStep(0);
    });
  });
})();
