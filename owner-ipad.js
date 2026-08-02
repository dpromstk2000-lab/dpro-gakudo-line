(() => {
  "use strict";
  const A = window.GakudoApp;
  const C = A.config;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const today = () => new Date(Date.now() + 32400000).toISOString().slice(0, 10);
  const addDays = (v,n) => { const d=new Date(`${v}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const labels = {
    planned: "未入室", overdue_arrival: "入室時刻超過", arrived: "入室済み", pickup_waiting: "お迎え待ち",
    overdue_departure: "退室時刻超過", departed: "退室済み", absent: "欠席",
    guardian_pickup: "保護者お迎え", authorized_pickup: "代理お迎え", solo_return: "一人帰り",
    facility_shuttle: "施設送迎", other: "その他", absence: "欠席", add_day: "利用追加",
    change_arrival: "入室時刻変更", change_departure: "退室時刻変更", change_method: "退室方法変更",
    pending: "承認待ち", approved: "承認", partially_approved: "一部承認", waitlisted: "待機", applied: "反映済み", rejected: "却下", cancelled: "取消",
    low: "低", normal: "通常", high: "重要", urgent: "緊急", open: "未対応", acknowledged: "確認済み",
    investigating: "確認中", guardian_followup: "保護者対応", resolved: "解決", closed: "完了",
    near_miss: "ヒヤリハット", injury: "けが", illness: "体調不良", missing_child: "所在確認",
    pickup_mismatch: "お迎え相違", allergy: "アレルギー", conflict: "児童間トラブル", property_damage: "物損",
    medium: "中", critical: "重大"
  };
  const label = (v) => labels[v] || v || "-";
  const chip = (text, cls = "") => `<span class="ipad-chip ${cls}">${esc(text)}</span>`;
  const dateTime = (v) => v ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "-";

  let dashboard = null;
  let requests = null;
  let lineRequests = null;
  let systemCheck = null;
  let capacityData = null;
  let notificationData = null;
  let busy = false;
  let refreshTimer = null;
  let clockTimer = null;

  function status(message, type = "ok") {
    const el = $("#ipadStatus");
    el.textContent = message;
    el.className = `status ipad-status show ${type}`;
    clearTimeout(status.timer);
    status.timer = setTimeout(() => el.classList.remove("show"), 6000);
  }

  function setLogged(on) {
    $("#ipadLogin").classList.toggle("hidden", on);
    $("#ipadApp").classList.toggle("hidden", !on);
    if (on) startTimers(); else stopTimers();
  }

  function setBusy(on) {
    busy = on;
    $$('button').forEach((b) => { if (!b.matches('[type="button"][data-view]')) b.disabled = on; });
    document.body.setAttribute("aria-busy", on ? "true" : "false");
  }

  async function safeRun(task, successMessage = "") {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      if (successMessage) status(successMessage);
    } catch (error) {
      status(error?.message || "処理できませんでした。", "error");
    } finally {
      setBusy(false);
    }
  }

  async function login(facilityCode, staffCode, accessCode) {
    const result = await A.ownerApi("/owner/login", {
      method: "POST", auth: false,
      body: { facilityCode, staffCode, accessCode }
    });
    A.setOwnerToken(result.token);
    await loadAll();
    setLogged(true);
    status("管理者iPad画面を開きました。");
  }

  async function loadAll() {
    [dashboard, requests, lineRequests, capacityData, notificationData] = await Promise.all([
      A.ownerApi(`/admin/dashboard?date=${today()}`),
      A.ownerApi("/admin/requests?status=pending&limit=100"),
      A.ownerApi("/admin/line-link-requests?status=pending&limit=100"),
      A.ownerApi(`/admin/holiday-capacity?from=${today()}&to=${addDays(today(),45)}`),
      A.ownerApi("/admin/notifications?status=open&limit=100")
    ]);
    $("#ipadOwnerName").textContent = dashboard.staff?.displayName || dashboard.auth?.staffCode || "管理者";
    $("#ipadOwnerMeta").textContent = `${dashboard.staff?.staffCode || dashboard.auth?.staffCode || ""} / ${dashboard.staff?.role || dashboard.auth?.role || ""}`;
    $("#ipadFacilityName").textContent = dashboard.facility?.facilityName || C.facilityName;
    renderAll();
  }

  function renderAll() {
    renderSummary();
    renderToday();
    renderAttendance();
    renderApprovals();
    renderHandoffs();
    renderSafety();
    renderCapacity();
    renderNotifications();
    fillChildOptions();
    const s = dashboard.summary || {};
    const approvalCount = Number(s.pendingLineLinks || 0) + Number(s.pendingAbsenceChanges || 0) + Number(s.pendingPickupChanges || 0) + Number(s.pendingSoloReturns || 0);
    $("#ipadApprovalTabCount").textContent = `${approvalCount}件`;
    $("#ipadAttendanceTabCount").textContent = `${s.total || 0}名`;
    $("#ipadHandoffTabCount").textContent = `${s.openHandoffs || 0}件`;
    $("#ipadSafetyTabCount").textContent = `${s.openIncidents || 0}件`;
    $("#ipadCapacityTabCount").textContent = `${capacityData?.summary?.pendingApplications || 0}件`;
    $("#ipadNotificationTabCount").textContent = `${notificationData?.summary?.openAlerts || 0}件`;
  }

  function renderCapacity() {
    if (!capacityData) return;
    const s=capacityData.summary||{};
    const items=[["受付中",s.openPeriods||0],["申請待ち",s.pendingApplications||0],["満員日",s.daysFull||0],["停止日",s.daysClosed||0],["休暇待機",s.holidayWaitlistedDays||0],["曜日待機",s.enrollmentWaiting||0]];
    $("#ipadCapacitySummary").innerHTML=items.map(([k,v],i)=>`<article class="ipad-summary-card ${i>1&&Number(v)?"alert":""}"><span>${esc(k)}</span><strong>${v}</strong></article>`).join("");
    $("#ipadCapacityDays").innerHTML=(capacityData.capacityDays||[]).slice(0,20).map(d=>`<article class="ipad-row"><div><strong>${d.date}</strong><p>${esc(d.period?.periodName||"通常日")}</p></div>${chip(d.closed?"停止":d.remaining===0?"満員":`残り${d.remaining}名`,d.closed||d.remaining===0?"danger":d.remaining<=3?"warn":"")}</article>`).join("");
    $("#ipadHolidayApplications").innerHTML=(capacityData.applications||[]).map(a=>`<article class="ipad-row"><div><strong>${esc(a.childName)}・${esc(a.periodName)}</strong><p>${a.requestedDates.length}日申請</p></div>${chip(label(a.status),a.status==="pending"?"warn":"")}</article>`).join("")||'<p class="muted">申請はありません。</p>';
  }

  function renderNotifications(){if(!notificationData)return;const s=notificationData.summary||{};const items=[["未完了",s.openAlerts||0],["緊急",s.criticalAlerts||0],["送信待ち",s.pendingJobs||0],["保留",s.heldJobs||0],["本日送信",s.sentToday||0],["失敗",s.failedJobs||0]];$("#ipadNotificationSummary").innerHTML=items.map(([k,v],i)=>`<article class="ipad-summary-card ${(i===0||i===1||i===5)&&Number(v)?"alert":""}"><span>${k}</span><strong>${v}</strong></article>`).join("");$("#ipadNotificationAlerts").innerHTML=(notificationData.alerts||[]).map(a=>`<article class="ipad-notification-card ${a.severity}"><div class="section-head"><div><h3>${esc(a.title)}</h3><p>${esc(a.childName||"")}</p></div>${chip(label(a.severity),a.severity==="critical"?"danger":"warn")}</div><p>${esc(a.body)}</p><div class="ipad-notification-actions">${a.status==="open"?`<button class="btn secondary ipad-alert-action" data-id="${a.id}" data-action="acknowledge" type="button">確認済み</button>`:"<span></span>"}<button class="btn primary ipad-alert-action" data-id="${a.id}" data-action="resolve" type="button">解決</button></div></article>`).join("")||'<p class="muted">未完了の警告はありません。</p>';$("#ipadNotificationJobs").innerHTML=(notificationData.jobs||[]).slice(0,20).map(j=>`<article class="ipad-notification-card"><div class="section-head"><strong>${esc(j.title)}</strong>${chip(label(j.status),j.status==="failed"?"danger":j.status==="held"?"warn":"")}</div><p>${esc(j.recipientName||j.childName||"-")}／${esc(j.body)}</p></article>`).join("")||'<p class="muted">通知キューはありません。</p>';$$('.ipad-alert-action').forEach(b=>b.onclick=()=>ipadAlertAction(b.dataset.id,b.dataset.action))}
  async function ipadAlertAction(id,action){await safeRun(async()=>{await A.ownerApi(`/admin/notifications/alerts/${id}/action`,{method:'POST',body:{action,note:''}});await loadAll()},'警告を更新しました。')}
  async function ipadPrepareNotifications(){await safeRun(async()=>{await A.ownerApi('/admin/notifications/prepare',{method:'POST',body:{}});await loadAll()},'自動確認を実行しました。')}

  function renderSummary() {
    const s = dashboard.summary || {};
    const items = [
      ["利用予定", s.total || 0], ["未入室", (s.planned || 0) + (s.overdueArrival || 0)],
      ["入室中", (s.arrived || 0) + (s.pickupWaiting || 0) + (s.overdueDeparture || 0)],
      ["退室済み", s.departed || 0], ["欠席", s.absent || 0],
      ["承認待ち", Number(s.pendingLineLinks || 0) + Number(s.pendingAbsenceChanges || 0) + Number(s.pendingPickupChanges || 0) + Number(s.pendingSoloReturns || 0)],
      ["警告", Number(s.overdueArrival || 0) + Number(s.overdueDeparture || 0) + Number(s.allergyWarnings || 0)],
      ["事故未完了", s.openIncidents || 0], ["申し送り", s.openHandoffs || 0],
      ["児童", s.activeChildren || 0], ["保護者", s.activeGuardians || 0], ["職員", s.activeStaff || 0]
    ];
    $("#ipadSummary").innerHTML = items.map(([name, value], index) => `<article class="ipad-summary-card ${[5,6,7].includes(index) && Number(value) ? "alert" : ""}"><span>${esc(name)}</span><strong>${Number(value) || 0}</strong></article>`).join("");
  }

  function renderToday() {
    const children = dashboard.attendance?.children || [];
    const alerts = children.filter((c) => c.hasAllergy || c.overdueArrival || c.overdueDeparture);
    $("#ipadAlertChildren").innerHTML = alerts.map((c) => `<article class="ipad-row"><div><strong>${esc(c.fullName)}</strong><p>${esc(label(c.currentState))}・${esc(label(c.departureMethod))}</p></div>${chip(c.hasAllergy ? "アレルギー注意" : c.overdueArrival ? "入室超過" : "退室超過", c.hasAllergy ? "warn" : "danger")}</article>`).join("") || '<p class="muted">現在、注意が必要な児童はいません。</p>';
    $("#ipadPendingPreview").innerHTML = (dashboard.pendingRequests || []).slice(0, 6).map((r) => `<article class="ipad-row"><div><strong>${esc(r.childName || "-")}</strong><p>${esc(label(r.kind))}・${esc(r.targetDate || r.validFrom || "")}</p></div>${chip("承認待ち", "warn")}</article>`).join("") || '<p class="muted">承認待ちはありません。</p>';
    $("#ipadHandoffPreview").innerHTML = (dashboard.attendance?.handoffs || []).slice(0, 6).map((h) => `<article class="ipad-row"><div><strong>${esc(h.childName || "施設全体")}</strong><p>${esc(h.content)}</p></div>${chip(label(h.priority), h.priority === "urgent" ? "danger" : h.priority === "high" ? "warn" : "")}</article>`).join("") || '<p class="muted">未完了の申し送りはありません。</p>';
    $("#ipadIncidentPreview").innerHTML = (dashboard.incidents || []).slice(0, 6).map((i) => `<article class="ipad-row"><div><strong>${esc(i.childName || "施設全体")}</strong><p>${esc(label(i.incidentType))}・${esc(i.summary)}</p></div>${chip(label(i.severity), ["high","critical"].includes(i.severity) ? "danger" : "warn")}</article>`).join("") || '<p class="muted">未完了の事故記録はありません。</p>';
  }

  function filteredChildren() {
    const filter = $("#ipadAttendanceFilter").value;
    const children = dashboard.attendance?.children || [];
    return children.filter((c) => filter === "all" || c.currentState === filter ||
      (filter === "planned" && ["planned", "overdue_arrival"].includes(c.currentState)) ||
      (filter === "arrived" && ["arrived", "overdue_departure"].includes(c.currentState)) ||
      (filter === "alert" && (c.hasAllergy || c.overdueArrival || c.overdueDeparture)));
  }

  function renderAttendance() {
    const children = filteredChildren();
    $("#ipadChildGrid").innerHTML = children.map((c) => {
      const alertClass = c.overdueArrival || c.overdueDeparture ? "overdue" : c.hasAllergy ? "alert" : "";
      const pickupName = c.pickup?.person?.fullName || c.pickup?.guardian?.fullName || "";
      return `<article class="ipad-child-card ${alertClass}"><div class="ipad-child-head"><div><h2>${esc(c.fullName)}</h2><p class="muted">${c.grade || "-"}年・${esc(c.schoolName || "")}</p><div class="ipad-child-meta">${chip(label(c.currentState), c.overdueArrival || c.overdueDeparture ? "danger" : "")}${c.hasAllergy ? chip("アレルギー注意", "warn") : ""}</div></div><button class="btn detail ipad-child-detail" data-id="${c.id}" type="button">記録</button></div><div class="ipad-child-times"><div class="ipad-time-box"><span>入室予定</span><strong>${esc(c.expectedArrivalTime || "--:--")}</strong></div><div class="ipad-time-box"><span>退室予定</span><strong>${esc(c.expectedDepartureTime || "--:--")}</strong></div></div><p class="ipad-pickup-note">${esc(label(c.departureMethod))}${pickupName ? `：${esc(pickupName)}` : ""}</p>${c.guardianNote ? `<p class="alert">保護者連絡：${esc(c.guardianNote)}</p>` : ""}<div class="ipad-child-actions">${attendanceButtons(c)}</div></article>`;
    }).join("") || '<p class="muted">該当する児童はいません。</p>';
    $$(".ipad-child-detail").forEach((b) => b.onclick = () => openChildDialog(b.dataset.id));
    $$('[data-ipad-event]').forEach((b) => b.onclick = () => submitAttendance(b.dataset.id, b.dataset.ipadEvent));
  }

  function attendanceButtons(c) {
    if (["absent", "departed"].includes(c.currentState)) return '<span></span><span></span><span></span>';
    if (["planned", "overdue_arrival"].includes(c.currentState)) return `<button class="btn primary" data-ipad-event="arrived" data-id="${c.id}" type="button">入室</button><span></span><span></span>`;
    if (["arrived", "overdue_departure"].includes(c.currentState)) return `<button class="btn secondary" data-ipad-event="pickup_waiting" data-id="${c.id}" type="button">お迎え待ち</button><button class="btn primary" data-ipad-event="departed" data-id="${c.id}" type="button">退室</button><span></span>`;
    if (c.currentState === "pickup_waiting") return `<button class="btn primary" data-ipad-event="departed" data-id="${c.id}" type="button">退室</button><span></span><span></span>`;
    return "";
  }

  async function submitAttendance(id, eventType) {
    const child = (dashboard.attendance?.children || []).find((c) => c.id === id);
    if (!child) return;
    const body = { childId: id, eventType };
    if (eventType === "departed") {
      if (["guardian_pickup", "authorized_pickup"].includes(child.departureMethod)) {
        if (!confirm(`${child.fullName}さんのお迎え者の本人確認を行いましたか？`)) return;
        body.identityConfirmed = true;
        if (child.departureMethod === "authorized_pickup") body.pickupPersonId = child.pickup?.person?.id || null;
        if (child.departureMethod === "guardian_pickup") body.pickupGuardianId = child.pickup?.guardian?.id || null;
      }
      body.confirmationNote = prompt("退室確認メモ（予定より早い場合は必須）", "") || null;
    }
    await safeRun(async () => {
      await A.ownerApi("/staff/attendance-event", { method: "POST", body });
      await loadAll();
    }, `${child.fullName}さんを${eventType === "arrived" ? "入室" : eventType === "pickup_waiting" ? "お迎え待ち" : "退室"}にしました。`);
  }

  function requestCard(kind, r) {
    const title = kind === "absence" ? `${label(r.requestType)}・${r.targetDate}` : kind === "pickup" ? `${label(r.newDepartureMethod)}・${r.targetDate}` : `一人帰り・${r.validFrom}`;
    const detail = kind === "absence" ? `${r.requestedArrivalTime || ""} ${r.requestedDepartureTime || ""} ${r.reason || ""}` : kind === "pickup" ? `${r.newDepartureTime || ""} ${r.newPickupPersonName || r.newPickupGuardianName || ""} ${r.reason || ""}` : `${r.defaultDepartureTime || ""} ${r.routeNote || ""}`;
    return `<article class="ipad-request-card"><div class="section-head"><div><strong>${esc(r.childName || "-")}</strong><p>${esc(title)}</p></div>${chip("承認待ち", "warn")}</div><p class="muted">保護者：${esc(r.guardianName || "-")}</p><p>${esc(detail)}</p><div class="ipad-request-actions"><button class="btn primary ipad-review" data-kind="${kind}" data-id="${r.id}" data-decision="approved" type="button">承認</button><button class="btn danger ipad-review" data-kind="${kind}" data-id="${r.id}" data-decision="rejected" type="button">却下</button></div></article>`;
  }

  function renderApprovals() {
    $("#ipadAbsenceRequests").innerHTML = (requests?.absenceChanges || []).map((r) => requestCard("absence", r)).join("") || '<p class="muted">承認待ちはありません。</p>';
    $("#ipadPickupRequests").innerHTML = (requests?.pickupChanges || []).map((r) => requestCard("pickup", r)).join("") || '<p class="muted">承認待ちはありません。</p>';
    $("#ipadSoloRequests").innerHTML = (requests?.soloReturns || []).map((r) => requestCard("solo", r)).join("") || '<p class="muted">承認待ちはありません。</p>';
    $("#ipadLineRequests").innerHTML = (lineRequests?.requests || []).map((r) => {
      const guardian = r.matchedGuardian;
      const canApprove = guardian?.id && guardian.phoneMatches && guardian.identityVerified;
      return `<article class="ipad-request-card"><div class="section-head"><div><strong>${esc(r.guardianNameInput || "-")}</strong><p>${esc(r.phoneInput || "")}・児童 ${esc(r.childNameInput || "-")}</p></div>${chip("承認待ち", "warn")}</div>${guardian ? `<p>台帳候補：${esc(guardian.fullName)}／電話一致 ${guardian.phoneMatches ? "○" : "×"}／本人確認 ${guardian.identityVerified ? "済" : "未"}</p>` : '<p class="ipad-chip danger">一致する台帳がありません</p>'}<div class="ipad-request-actions">${canApprove ? `<button class="btn primary ipad-line-review" data-id="${r.id}" data-guardian="${guardian.id}" data-decision="approved" type="button">本人確認して承認</button>` : ""}<button class="btn danger ipad-line-review" data-id="${r.id}" data-decision="rejected" type="button">却下</button></div></article>`;
    }).join("") || '<p class="muted">承認待ちはありません。</p>';
    $$(".ipad-review").forEach((b) => b.onclick = () => reviewRequest(b.dataset.kind, b.dataset.id, b.dataset.decision));
    $$(".ipad-line-review").forEach((b) => b.onclick = () => reviewLine(b));
  }

  async function reviewRequest(kind, id, decision) {
    const action = decision === "approved" ? "承認" : "却下";
    if (!confirm(`${action}してよろしいですか？`)) return;
    const note = prompt(`${action}メモ`, "") || "";
    const paths = { absence: "absence-change-requests", pickup: "pickup-change-requests", solo: "solo-return-requests" };
    await safeRun(async () => {
      await A.ownerApi(`/admin/${paths[kind]}/${id}/review`, { method: "POST", body: { decision, decisionNote: note } });
      await loadAll();
    }, `申請を${action}しました。`);
  }

  async function reviewLine(button) {
    const decision = button.dataset.decision;
    const body = { decision };
    if (decision === "approved") {
      const note = prompt("本人確認方法・確認内容", "登録電話番号と本人申告を確認") || "";
      if (!note) return;
      Object.assign(body, { confirmIdentity: true, guardianId: button.dataset.guardian, identityCheckNote: note });
    } else {
      const reason = prompt("却下理由", "本人確認ができないため") || "";
      if (!reason) return;
      body.rejectionReason = reason;
    }
    await safeRun(async () => {
      await A.ownerApi(`/admin/line-link-requests/${button.dataset.id}/review`, { method: "POST", body });
      await loadAll();
    }, decision === "approved" ? "LINE連携を承認しました。" : "LINE連携申請を却下しました。");
  }

  function renderHandoffs() {
    $("#ipadHandoffList").innerHTML = (dashboard.attendance?.handoffs || []).map((h) => `<article class="ipad-handoff-card"><div class="section-head"><div><strong>${esc(h.childName || "施設全体")}</strong><p>${esc(h.content)}</p></div>${chip(label(h.priority), h.priority === "urgent" ? "danger" : h.priority === "high" ? "warn" : "")}</div><p class="muted">${esc(h.category || "")}・${dateTime(h.createdAt)}</p><div class="ipad-request-actions"><button class="btn secondary ipad-handoff-ack" data-id="${h.id}" data-resolve="false" type="button">確認済み</button><button class="btn primary ipad-handoff-ack" data-id="${h.id}" data-resolve="true" type="button">完了</button></div></article>`).join("") || '<p class="muted">未完了の申し送りはありません。</p>';
    $$(".ipad-handoff-ack").forEach((b) => b.onclick = () => acknowledgeHandoff(b.dataset.id, b.dataset.resolve === "true"));
  }

  async function acknowledgeHandoff(id, resolve) {
    await safeRun(async () => {
      await A.ownerApi(`/staff/handoffs/${id}/acknowledge`, { method: "POST", body: { resolve } });
      await loadAll();
    }, resolve ? "申し送りを完了しました。" : "申し送りを確認済みにしました。");
  }

  function renderSafety() {
    $("#ipadIncidentList").innerHTML = (dashboard.incidents || []).map((i) => `<article class="ipad-incident-card"><div class="section-head"><div><strong>${esc(i.childName || "施設全体")}</strong><p>${esc(label(i.incidentType))}・${dateTime(i.occurredAt)}</p></div>${chip(label(i.severity), ["high","critical"].includes(i.severity) ? "danger" : "warn")}</div><p>${esc(i.summary)}</p><p class="muted">初動：${esc(i.immediateAction || "-")}</p><div class="field"><label>対応状態</label><select class="control ipad-incident-status" data-id="${i.id}"><option value="open">未対応</option><option value="investigating">確認中</option><option value="guardian_followup">保護者対応</option><option value="resolved">解決</option><option value="closed">完了</option></select></div><div class="field"><label>保護者連絡</label><select class="control ipad-incident-guardian" data-id="${i.id}"><option value="not_required">不要</option><option value="pending">未連絡</option><option value="contacted">連絡済み</option><option value="unable_to_reach">不通</option></select></div><div class="field"><label>再発防止策</label><textarea class="control ipad-incident-prevention" data-id="${i.id}"></textarea></div><button class="btn primary ipad-incident-save" data-id="${i.id}" type="button">管理者確認を保存</button></article>`).join("") || '<p class="muted">未完了の事故・ヒヤリハットはありません。</p>';
    (dashboard.incidents || []).forEach((i) => {
      const statusEl = document.querySelector(`.ipad-incident-status[data-id="${i.id}"]`);
      const guardianEl = document.querySelector(`.ipad-incident-guardian[data-id="${i.id}"]`);
      if (statusEl) statusEl.value = i.status;
      if (guardianEl) guardianEl.value = i.guardianContactStatus;
    });
    $$(".ipad-incident-save").forEach((b) => b.onclick = () => saveIncident(b.dataset.id));
  }

  async function saveIncident(id) {
    const body = {
      status: document.querySelector(`.ipad-incident-status[data-id="${id}"]`).value,
      guardianContactStatus: document.querySelector(`.ipad-incident-guardian[data-id="${id}"]`).value,
      medicalContactStatus: "not_required",
      preventionAction: document.querySelector(`.ipad-incident-prevention[data-id="${id}"]`).value
    };
    await safeRun(async () => {
      await A.ownerApi(`/admin/incidents/${id}/review`, { method: "POST", body });
      await loadAll();
    }, "事故・ヒヤリハットの管理者確認を保存しました。");
  }

  function fillChildOptions() {
    const children = dashboard.attendance?.children || [];
    const options = children.map((c) => `<option value="${c.id}">${esc(c.fullName)}</option>`).join("");
    $("#ipadHandoffChild").innerHTML = '<option value="">施設全体</option>' + options;
    $("#ipadIncidentChild").innerHTML = '<option value="">施設全体</option>' + options;
  }

  function openChildDialog(id) {
    const child = (dashboard.attendance?.children || []).find((c) => c.id === id);
    if (!child) return;
    const daily = child.dailyCheck || {};
    $("#ipadChildDialogBody").innerHTML = `<h2>${esc(child.fullName)}さんの日常確認</h2>${child.hasAllergy ? `<div class="alert"><strong>アレルギー注意</strong>${(child.allergies || []).map((a) => `<p>${esc(a.allergen)}・${esc(a.severity)}<br>${esc(a.avoidanceInstruction || "")}</p>`).join("")}</div>` : ""}<form id="ipadDailyForm"><input id="ipadDailyChildId" type="hidden" value="${child.id}"><div class="ipad-form-grid"><div class="field"><label>おやつ</label><select id="ipadDailySnack" class="control"><option value="not_checked">未確認</option><option value="provided">提供済み</option><option value="partially_eaten">一部</option><option value="not_eaten">食べず</option><option value="allergy_alternative">代替食</option><option value="not_provided">提供なし</option></select></div><div class="field"><label>宿題</label><select id="ipadDailyHomework" class="control"><option value="not_checked">未確認</option><option value="none">なし</option><option value="started">取組中</option><option value="completed">完了</option><option value="support_needed">支援必要</option></select></div><div class="field"><label>体調</label><select id="ipadDailyHealth" class="control"><option value="normal">良好</option><option value="watch">経過観察</option><option value="unwell">体調不良</option><option value="injured">けが</option><option value="sent_home">早退</option></select></div><div class="field"><label>保護者共有</label><select id="ipadDailyShare" class="control"><option value="internal_only">内部のみ</option><option value="draft">共有下書き</option><option value="published">共有済み</option><option value="withheld">共有保留</option></select></div></div><div class="field"><label>様子</label><input id="ipadDailyMood" class="control" maxlength="100" value="${esc(daily.moodStatus || "")}"></div><div class="field"><label>体調・けがメモ</label><textarea id="ipadDailyNote" class="control" maxlength="2000">${esc(daily.healthNote || daily.injuryNote || "")}</textarea></div><label><input id="ipadDailyInjury" type="checkbox" ${daily.injuryObserved ? "checked" : ""}> けがを確認</label><br><br><button class="btn primary" type="submit">記録を保存</button></form>`;
    $("#ipadDailySnack").value = daily.snackStatus || "not_checked";
    $("#ipadDailyHomework").value = daily.homeworkStatus || "not_checked";
    $("#ipadDailyHealth").value = daily.healthStatus || "normal";
    $("#ipadDailyShare").value = daily.guardianShareStatus || "internal_only";
    $("#ipadDailyForm").onsubmit = saveDaily;
    $("#ipadChildDialog").showModal();
  }

  async function saveDaily(event) {
    event.preventDefault();
    const body = {
      childId: $("#ipadDailyChildId").value, checkDate: today(),
      snackStatus: $("#ipadDailySnack").value, homeworkStatus: $("#ipadDailyHomework").value,
      healthStatus: $("#ipadDailyHealth").value, healthNote: $("#ipadDailyNote").value,
      moodStatus: $("#ipadDailyMood").value, injuryObserved: $("#ipadDailyInjury").checked,
      injuryNote: $("#ipadDailyNote").value, guardianShareStatus: $("#ipadDailyShare").value
    };
    await safeRun(async () => {
      await A.ownerApi("/staff/daily-check", { method: "POST", body });
      $("#ipadChildDialog").close();
      await loadAll();
    }, "日常確認を保存しました。");
  }

  async function runSystemCheck() {
    systemCheck = await A.ownerApi("/admin/system-check");
    const pairs = [
      ["全体", systemCheck.ok], ["DB", systemCheck.dbOk], ["認証", systemCheck.authOk], ["家族管理", systemCheck.familyOk],
      ["保護者", systemCheck.guardianOk], ["入退室", systemCheck.attendanceOk], ["管理者", systemCheck.ownerOk],
      ["通知", systemCheck.notificationOk], ["デモ準備", systemCheck.demoPrepared], ["公開ガード", systemCheck.productionGuardOk]
    ];
    $("#ipadSystemGrid").innerHTML = pairs.map(([name, ok]) => `<article class="ipad-system-card"><span>${esc(name)}</span><strong>${ok ? "正常" : "要確認"}</strong>${chip(ok ? "PASS" : "FAIL", ok ? "" : "danger")}</article>`).join("");
    $("#ipadSystemDetail").textContent = JSON.stringify(systemCheck, null, 2);
  }

  function showView(name) {
    $$(".ipad-view").forEach((v) => v.classList.add("hidden"));
    $$(".ipad-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    const target = $(`#ipadView${name[0].toUpperCase()}${name.slice(1)}`);
    if (target) target.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateClock() {
    const now = new Date();
    $("#ipadTodayLabel").textContent = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long", weekday: "short" }).format(now);
    $("#ipadClock").textContent = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  }

  function startTimers() {
    stopTimers();
    updateClock();
    clockTimer = setInterval(updateClock, 1000);
    refreshTimer = setInterval(() => { if (!document.hidden && !busy) loadAll().catch(() => {}); }, 60000);
  }

  function stopTimers() {
    if (clockTimer) clearInterval(clockTimer);
    if (refreshTimer) clearInterval(refreshTimer);
    clockTimer = null;
    refreshTimer = null;
  }

  $("#ipadVersion").textContent = C.version;
  $("#ipadFacilityCode").value = C.facilityCode;
  $("#ipadStaffCode").value = C.demo.managerCode;
  $("#ipadDemoLogin").onclick = () => safeRun(() => login(C.facilityCode, C.demo.managerCode, C.demo.accessCode));
  $("#ipadLoginButton").onclick = () => safeRun(() => login($("#ipadFacilityCode").value.trim(), $("#ipadStaffCode").value.trim(), $("#ipadAccessCode").value));
  $("#ipadClearCode").onclick = () => { $("#ipadAccessCode").value = ""; $("#ipadAccessCode").focus(); };
  $("#ipadReload").onclick = () => safeRun(loadAll, "最新情報に更新しました。");
  $("#ipadLogout").onclick = () => safeRun(async () => { try { await A.ownerApi("/auth/logout", { method: "POST" }); } catch {} A.setOwnerToken(""); setLogged(false); }, "ログアウトしました。");
  $("#ipadFullscreen").onclick = async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { status("このブラウザーでは全画面表示を使用できません。", "error"); } };
  $("#ipadAttendanceFilter").onchange = renderAttendance;
  $("#ipadOpenHandoff").onclick = () => $("#ipadHandoffFormPanel").classList.toggle("hidden");
  $("#ipadOpenIncident").onclick = () => $("#ipadIncidentFormPanel").classList.toggle("hidden");
  $("#ipadRunSystemCheck").onclick = () => safeRun(runSystemCheck, "一括確認を実行しました。");
  $("#ipadNotificationPrepare").onclick = ipadPrepareNotifications;
  $$(".ipad-tabs button").forEach((b) => b.onclick = () => showView(b.dataset.view));
  $$(".ipad-jump").forEach((b) => b.onclick = () => showView(b.dataset.target));

  $("#ipadHandoffForm").onsubmit = (event) => {
    event.preventDefault();
    safeRun(async () => {
      await A.ownerApi("/staff/handoffs", { method: "POST", body: {
        childId: $("#ipadHandoffChild").value || null, category: $("#ipadHandoffCategory").value,
        priority: $("#ipadHandoffPriority").value, visibility: $("#ipadHandoffVisibility").value,
        content: $("#ipadHandoffContent").value
      }});
      event.target.reset();
      $("#ipadHandoffFormPanel").classList.add("hidden");
      await loadAll();
    }, "申し送りを登録しました。");
  };

  $("#ipadIncidentForm").onsubmit = (event) => {
    event.preventDefault();
    if (!confirm("事故・ヒヤリハット速報を登録しますか？")) return;
    safeRun(async () => {
      await A.ownerApi("/staff/incidents", { method: "POST", body: {
        childId: $("#ipadIncidentChild").value || null, incidentType: $("#ipadIncidentType").value,
        severity: $("#ipadIncidentSeverity").value, location: $("#ipadIncidentLocation").value,
        summary: $("#ipadIncidentSummary").value, immediateAction: $("#ipadIncidentAction").value,
        guardianContactStatus: "pending", medicalContactStatus: "not_required"
      }});
      event.target.reset();
      $("#ipadIncidentFormPanel").classList.add("hidden");
      await loadAll();
    }, "事故・ヒヤリハット速報を登録しました。");
  };

  document.addEventListener("visibilitychange", () => { if (!document.hidden && A.getOwnerToken() && !busy) loadAll().catch(() => {}); });
  window.addEventListener("beforeunload", stopTimers);

  (async () => {
    if (A.getOwnerToken()) {
      try { await loadAll(); setLogged(true); }
      catch { A.setOwnerToken(""); setLogged(false); }
    }
  })();
})();
