(() => {
  "use strict";
  const A = window.GakudoApp;
  const C = A.config;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = A.esc;
  const jstToday = () => new Date(Date.now() + 32400000).toISOString().slice(0, 10);
  let dashboard = null;
  let requests = null;
  let family = null;
  let lineRequests = null;
  let staffData = null;
  let capacityData = null;
  let notificationData = null;

  const status = (message, type = "ok") => {
    const el = $("#ownerStatus");
    el.textContent = message;
    el.className = `status owner-status show ${type}`;
    setTimeout(() => el.classList.remove("show"), 6000);
  };

  const setLogged = (on) => {
    $("#ownerLogin").classList.toggle("hidden", on);
    $("#ownerApp").classList.toggle("hidden", !on);
  };

  const labels = {
    planned: "未入室", overdue_arrival: "入室超過", arrived: "入室済み",
    pickup_waiting: "お迎え待ち", overdue_departure: "退室超過", departed: "退室済み", absent: "欠席",
    absence: "欠席", add_day: "利用追加", change_arrival: "入室時刻変更", change_departure: "退室時刻変更",
    change_method: "退室方法変更", cancel_request: "利用取消",
    guardian_pickup: "保護者お迎え", authorized_pickup: "代理お迎え", solo_return: "一人帰り",
    facility_shuttle: "施設送迎", other: "その他", pending: "承認待ち", applied: "反映済み",
    approved: "承認", partially_approved: "一部承認", waitlisted: "待機", rejected: "却下", open: "未対応", investigating: "確認中",
    guardian_followup: "保護者対応", resolved: "解決", closed: "完了",
    injury: "けが", illness: "体調不良", missing_child: "所在確認", pickup_mismatch: "お迎え相違",
    allergy: "アレルギー", conflict: "児童間トラブル", near_miss: "ヒヤリハット",
    property_damage: "物損", low: "低", medium: "中", high: "高", critical: "重大"
  };
  const label = (v) => labels[v] || v || "-";
  const chip = (text, cls = "") => `<span class="state-chip ${cls}">${esc(text)}</span>`;
  const dateTime = (v) => v ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "-";

  async function login(staffCode, accessCode) {
    const result = await A.ownerApi("/owner/login", {
      method: "POST", auth: false,
      body: { facilityCode: C.facilityCode, staffCode, accessCode }
    });
    A.setOwnerToken(result.token);
    await loadAll();
    status("管理者画面を開きました。");
  }

  async function loadAll() {
    await Promise.all([loadDashboard(), loadRequests(), loadFamily(), loadLineRequests(), loadStaff(), loadCapacity(), loadNotifications()]);
    $("#ownerName").textContent = dashboard.staff?.displayName || dashboard.auth?.staffCode || "管理者";
    $("#ownerMeta").textContent = `${dashboard.staff?.staffCode || dashboard.auth?.staffCode || ""} / ${dashboard.staff?.role || dashboard.auth?.role || ""}`;
    $("#ownerFacilityName").textContent = dashboard.facility?.facilityName || C.facilityName;
    renderDashboard();
    renderRequests();
    renderChildren();
    renderLineRequests();
    renderSafety();
    renderStaff();
    renderCapacity();
    renderNotifications();
    setLogged(true);
  }

  async function loadDashboard() {
    const date = $("#ownerDate").value || jstToday();
    dashboard = await A.ownerApi(`/admin/dashboard?date=${encodeURIComponent(date)}`);
  }
  async function loadRequests() {
    const v = $("#requestStatus").value || "pending";
    requests = await A.ownerApi(`/admin/requests?status=${encodeURIComponent(v)}&limit=100`);
  }
  async function loadFamily() {
    const q = $("#childSearch").value.trim();
    const st = $("#childStatus").value;
    family = await A.ownerApi(`/staff/families?query=${encodeURIComponent(q)}&status=${encodeURIComponent(st)}&limit=200`);
  }
  async function loadLineRequests() {
    const v = $("#lineStatus").value || "pending";
    lineRequests = await A.ownerApi(`/admin/line-link-requests?status=${encodeURIComponent(v)}&limit=100`);
  }
  async function loadStaff() {
    try {
      staffData = await A.ownerApi("/admin/staff");
    } catch (error) {
      if (error.status === 403) staffData = { staff: dashboard?.staffList || [], restricted: true };
      else throw error;
    }
  }
  async function loadCapacity() {
    const from = $("#capacityFrom")?.value || jstToday();
    const to = $("#capacityTo")?.value || addDays(from, 60);
    capacityData = await A.ownerApi(`/admin/holiday-capacity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }
  async function loadNotifications() {
    const state = $("#notificationStatus")?.value || "open";
    notificationData = await A.ownerApi(`/admin/notifications?status=${encodeURIComponent(state)}&limit=150`);
  }
  function addDays(dateText, days) { const d = new Date(`${dateText}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }

  function renderDashboard() {
    const s = dashboard.summary || {};
    const items = [
      ["利用予定", s.total || 0], ["未入室", (s.planned || 0) + (s.overdueArrival || 0)],
      ["入室中", (s.arrived || 0) + (s.pickupWaiting || 0) + (s.overdueDeparture || 0)],
      ["退室済み", s.departed || 0], ["欠席", s.absent || 0],
      ["承認待ち", (s.pendingLineLinks || 0) + (s.pendingAbsenceChanges || 0) + (s.pendingPickupChanges || 0) + (s.pendingSoloReturns || 0)],
      ["事故未完了", s.openIncidents || 0], ["アレルギー", s.allergyWarnings || 0],
      ["児童", s.activeChildren || 0], ["保護者", s.activeGuardians || 0], ["職員", s.activeStaff || 0], ["申し送り", s.openHandoffs || 0]
    ];
    $("#ownerSummary").innerHTML = items.map(([k, v], i) => `<article class="owner-summary-card ${(i === 5 || i === 6 || i === 7) && Number(v) ? "alert-card" : ""}"><span>${esc(k)}</span><strong>${Number(v) || 0}</strong></article>`).join("");

    const children = dashboard.attendance?.children || [];
    $("#ownerTodayChildren").innerHTML = children.map(c => `<article class="owner-row"><div><strong>${esc(c.fullName)}</strong><p class="muted">${c.grade || "-"}年・${esc(label(c.departureMethod))}${c.hasAllergy ? "・アレルギー注意" : ""}</p></div>${chip(label(c.currentState), c.overdueArrival || c.overdueDeparture ? "danger" : c.hasAllergy ? "warn" : "")}</article>`).join("") || '<p class="muted">本日の予定はありません。</p>';

    $("#ownerPendingPreview").innerHTML = (dashboard.pendingRequests || []).slice(0, 8).map(r => `<article class="owner-row"><div><strong>${esc(r.childName || "-")}</strong><p>${esc(label(r.kind))}・${esc(r.targetDate || r.validFrom || "")}</p></div>${chip("承認待ち", "warn")}</article>`).join("") || '<p class="muted">承認待ちはありません。</p>';
    $("#ownerHandoffs").innerHTML = (dashboard.attendance?.handoffs || []).map(h => `<article class="owner-row priority-${esc(h.priority)}"><div><strong>${esc(h.childName || "施設全体")}</strong><p>${esc(h.content)}</p></div>${chip(label(h.priority), h.priority === "urgent" ? "danger" : h.priority === "high" ? "warn" : "")}</article>`).join("") || '<p class="muted">未完了の申し送りはありません。</p>';
    $("#ownerIncidentPreview").innerHTML = (dashboard.incidents || []).slice(0, 6).map(i => `<article class="owner-row"><div><strong>${esc(i.childName || "施設全体")}</strong><p>${esc(label(i.incidentType))}・${esc(i.summary)}</p></div>${chip(label(i.severity), ["high", "critical"].includes(i.severity) ? "danger" : "warn")}</article>`).join("") || '<p class="muted">未完了の事故記録はありません。</p>';
  }

  function requestCard(kind, r) {
    const isPending = r.status === "pending";
    const title = kind === "absence" ? `${label(r.requestType)}・${r.targetDate}` : kind === "pickup" ? `${label(r.newDepartureMethod)}・${r.targetDate}` : `一人帰り・${r.validFrom}`;
    const detail = kind === "absence" ? `${r.requestedArrivalTime || ""} ${r.requestedDepartureTime || ""} ${r.reason || ""}` : kind === "pickup" ? `${r.newDepartureTime || ""} ${r.newPickupPersonName || r.newPickupGuardianName || ""} ${r.reason || ""}` : `${r.defaultDepartureTime || ""} ${r.routeNote || ""}`;
    return `<article class="request-card"><div class="section-head"><div><strong>${esc(r.childName)}</strong><p>${esc(title)}</p></div>${chip(label(r.status), isPending ? "warn" : "")}</div><p class="muted">保護者：${esc(r.guardianName || "-")}</p><p>${esc(detail)}</p>${isPending ? `<div class="request-actions"><button class="btn primary request-review" data-kind="${kind}" data-id="${r.id}" data-decision="approved" type="button">承認</button><button class="btn danger request-review" data-kind="${kind}" data-id="${r.id}" data-decision="rejected" type="button">却下</button></div>` : ""}</article>`;
  }

  function renderRequests() {
    $("#absenceRequests").innerHTML = (requests?.absenceChanges || []).map(r => requestCard("absence", r)).join("") || '<p class="muted">該当申請はありません。</p>';
    $("#pickupRequests").innerHTML = (requests?.pickupChanges || []).map(r => requestCard("pickup", r)).join("") || '<p class="muted">該当申請はありません。</p>';
    $("#soloRequests").innerHTML = (requests?.soloReturns || []).map(r => requestCard("solo", r)).join("") || '<p class="muted">該当申請はありません。</p>';
    $$(".request-review").forEach(b => b.onclick = () => reviewRequest(b.dataset.kind, b.dataset.id, b.dataset.decision));
  }

  async function reviewRequest(kind, id, decision) {
    const action = decision === "approved" ? "承認" : "却下";
    if (!confirm(`${action}してよろしいですか？`)) return;
    const note = prompt(`${action}メモ`, "") || "";
    const paths = { absence: "absence-change-requests", pickup: "pickup-change-requests", solo: "solo-return-requests" };
    try {
      await A.ownerApi(`/admin/${paths[kind]}/${id}/review`, { method: "POST", body: { decision, decisionNote: note } });
      await Promise.all([loadDashboard(), loadRequests()]); renderDashboard(); renderRequests(); status(`申請を${action}しました。`);
    } catch (e) { status(e.message, "error"); }
  }

  function renderChildren() {
    $("#childLedger").innerHTML = (family?.children || []).map(c => `<article class="ledger-card child-open" data-id="${c.id}"><div class="ledger-meta">${chip(c.enrollmentStatus === "active" ? "利用中" : label(c.enrollmentStatus))}${c.hasAllergy ? chip("アレルギー", "warn") : ""}${c.soloReturnPermissionActive ? chip("一人帰り許可") : ""}</div><h3>${esc(c.fullName)}</h3><p>${esc(c.childCode)}・${c.grade || "-"}年・${esc(c.schoolName || "")}</p><p class="muted">保護者 ${(c.guardians || []).length}名／代理お迎え ${c.authorizedPickupCount || 0}名</p></article>`).join("") || '<p class="muted">児童が見つかりません。</p>';
    $$(".child-open").forEach(el => el.onclick = () => openChild(el.dataset.id));
  }

  async function openChild(id) {
    try {
      const d = await A.ownerApi(`/staff/children/${id}`);
      const c = d.child;
      $("#childModalBody").innerHTML = `<h2>${esc(c.fullName)}</h2><p>${esc(c.childCode)}・${c.grade || "-"}年・${esc(c.schoolName || "")}</p>${(d.allergyWarnings || []).length ? `<div class="alert"><strong>アレルギー注意</strong>${d.allergyWarnings.map(a => `<p>${esc(a.allergen)}・${esc(a.severity)}</p>`).join("")}</div>` : ""}<div class="detail-grid"><section class="detail-box"><h3>保護者</h3>${(d.guardians || []).map(g => `<p><strong>${esc(g.fullName)}</strong>（${esc(g.relationship)}）<br>${esc(g.phone || "")}</p>`).join("") || "未登録"}</section><section class="detail-box"><h3>代理お迎え</h3>${(d.authorizedPickupPeople || []).map(p => `<p>${esc(p.fullName)}（${esc(p.relationship)}）</p>`).join("") || "未登録"}</section><section class="detail-box"><h3>兄弟姉妹</h3>${(d.siblings || []).map(s => `<p>${esc(s.fullName)}・${s.grade || "-"}年</p>`).join("") || "未登録"}</section><section class="detail-box"><h3>一人帰り</h3>${(d.soloReturnPermissions || []).map(p => `<p>${esc(label(p.status))}・${esc(p.validFrom)}〜${esc(p.validTo || "")}</p>`).join("") || "許可なし"}</section></div><hr><h3>基本情報を編集</h3><form id="childEditForm"><input type="hidden" id="editChildId" value="${c.id}"><input type="hidden" id="editChildVersion" value="${c.version}"><div class="two"><div class="field"><label>氏名</label><input id="editChildName" class="control" value="${esc(c.fullName)}" required></div><div class="field"><label>学年</label><input id="editChildGrade" class="control" type="number" min="1" max="6" value="${c.grade || ""}"></div></div><div class="two"><div class="field"><label>学校</label><input id="editChildSchool" class="control" value="${esc(c.schoolName || "")}"></div><div class="field"><label>在籍状態</label><select id="editChildStatus" class="control"><option value="active">利用中</option><option value="waiting">待機</option><option value="paused">休止</option><option value="graduated">卒所</option><option value="withdrawn">退所</option></select></div></div><div class="field"><label>内部メモ</label><textarea id="editChildNotes" class="control">${esc(c.internalNotes || "")}</textarea></div><button class="btn primary" type="submit">保存</button></form>`;
      $("#editChildStatus").value = c.enrollmentStatus;
      $("#childEditForm").onsubmit = saveChild;
      $("#childModal").showModal();
    } catch (e) { status(e.message, "error"); }
  }

  async function saveChild(e) {
    e.preventDefault();
    try {
      await A.ownerApi("/admin/children/upsert", { method: "POST", body: {
        childId: $("#editChildId").value, expectedVersion: Number($("#editChildVersion").value),
        fullName: $("#editChildName").value, grade: $("#editChildGrade").value || null,
        schoolName: $("#editChildSchool").value, enrollmentStatus: $("#editChildStatus").value,
        internalNotes: $("#editChildNotes").value
      }});
      $("#childModal").close(); await loadFamily(); renderChildren(); status("児童情報を保存しました。");
    } catch (x) { status(x.message, "error"); }
  }

  async function newChild() {
    const fullName = prompt("児童氏名"); if (!fullName) return;
    const grade = prompt("学年（1〜6）", "1");
    const schoolName = prompt("学校名", "");
    try {
      await A.ownerApi("/admin/children/upsert", { method: "POST", body: { fullName, grade: grade || null, schoolName, enrollmentStatus: "active" } });
      await loadFamily(); renderChildren(); status("児童を登録しました。");
    } catch (e) { status(e.message, "error"); }
  }

  function renderLineRequests() {
    $("#lineRequests").innerHTML = (lineRequests?.requests || []).map(r => {
      const g = r.matchedGuardian;
      const canApprove = r.status === "pending" && g?.id && g.phoneMatches && g.identityVerified;
      return `<article class="line-card"><div class="section-head"><div><strong>${esc(r.guardianNameInput)}</strong><p>${esc(r.phoneInput)}・児童 ${esc(r.childNameInput || "-")}</p></div>${chip(label(r.status), r.status === "pending" ? "warn" : "")}</div>${g ? `<p>台帳候補：<strong>${esc(g.fullName)}</strong>／電話一致 ${g.phoneMatches ? "○" : "×"}／本人確認 ${g.identityVerified ? "済" : "未"}</p>` : '<p class="state-chip danger">一致する保護者台帳がありません</p>'}${r.status === "pending" ? `<div class="request-actions">${canApprove ? `<button class="btn primary line-review" data-id="${r.id}" data-guardian="${g.id}" data-decision="approved" type="button">本人確認して承認</button>` : ""}<button class="btn danger line-review" data-id="${r.id}" data-decision="rejected" type="button">却下</button></div>` : ""}</article>`;
    }).join("") || '<p class="muted">該当するLINE連携申請はありません。</p>';
    $$(".line-review").forEach(b => b.onclick = () => reviewLine(b));
  }

  async function reviewLine(button) {
    const decision = button.dataset.decision;
    if (decision === "approved") {
      const note = prompt("本人確認方法・確認内容", "登録電話番号と本人申告を確認") || "";
      if (!note) return;
      try {
        await A.ownerApi(`/admin/line-link-requests/${button.dataset.id}/review`, { method: "POST", body: { decision, confirmIdentity: true, guardianId: button.dataset.guardian, identityCheckNote: note } });
        await loadLineRequests(); renderLineRequests(); status("LINE連携を承認しました。");
      } catch (e) { status(e.message, "error"); }
    } else {
      const reason = prompt("却下理由", "本人確認ができないため") || ""; if (!reason) return;
      try {
        await A.ownerApi(`/admin/line-link-requests/${button.dataset.id}/review`, { method: "POST", body: { decision, rejectionReason: reason } });
        await loadLineRequests(); renderLineRequests(); status("LINE連携申請を却下しました。");
      } catch (e) { status(e.message, "error"); }
    }
  }

  function renderSafety() {
    $("#incidentList").innerHTML = (dashboard?.incidents || []).map(i => `<article class="incident-card"><div class="section-head"><div><strong>${esc(i.childName || "施設全体")}</strong><p>${esc(label(i.incidentType))}・${dateTime(i.occurredAt)}</p></div>${chip(label(i.severity), ["high", "critical"].includes(i.severity) ? "danger" : "warn")}</div><p>${esc(i.summary)}</p><p class="muted">初動：${esc(i.immediateAction || "-")}</p><div class="two"><div class="field"><label>対応状態</label><select class="control incident-status" data-id="${i.id}"><option value="open">未対応</option><option value="investigating">確認中</option><option value="guardian_followup">保護者対応</option><option value="resolved">解決</option><option value="closed">完了</option></select></div><div class="field"><label>保護者連絡</label><select class="control incident-guardian" data-id="${i.id}"><option value="not_required">不要</option><option value="pending">未連絡</option><option value="contacted">連絡済み</option><option value="unable_to_reach">不通</option></select></div></div><div class="field"><label>再発防止策</label><textarea class="control incident-prevention" data-id="${i.id}"></textarea></div><button class="btn primary incident-save" data-id="${i.id}" type="button">管理者確認を保存</button></article>`).join("") || '<p class="muted">未完了の事故・ヒヤリハットはありません。</p>';
    (dashboard?.incidents || []).forEach(i => {
      const s = document.querySelector(`.incident-status[data-id="${i.id}"]`); if (s) s.value = i.status;
      const g = document.querySelector(`.incident-guardian[data-id="${i.id}"]`); if (g) g.value = i.guardianContactStatus;
    });
    $$(".incident-save").forEach(b => b.onclick = () => saveIncident(b.dataset.id));
  }

  async function saveIncident(id) {
    try {
      await A.ownerApi(`/admin/incidents/${id}/review`, { method: "POST", body: {
        status: document.querySelector(`.incident-status[data-id="${id}"]`).value,
        guardianContactStatus: document.querySelector(`.incident-guardian[data-id="${id}"]`).value,
        medicalContactStatus: "not_required",
        preventionAction: document.querySelector(`.incident-prevention[data-id="${id}"]`).value
      }});
      await loadDashboard(); renderDashboard(); renderSafety(); status("事故記録の管理者確認を保存しました。");
    } catch (e) { status(e.message, "error"); }
  }

  function renderStaff() {
    $("#staffList").innerHTML = (staffData?.staff || []).map(s => `<article class="permission-card"><div class="section-head"><div><strong>${esc(s.displayName)}</strong><p>${esc(s.staffCode)}・${esc(label(s.role))}</p></div>${chip(s.isActive ? "有効" : "停止", s.isActive ? "" : "danger")}</div><div class="two"><div class="field"><label>役割</label><select class="control staff-role" data-id="${s.id}"><option value="owner">オーナー</option><option value="manager">管理者</option><option value="leader">リーダー</option><option value="staff">スタッフ</option><option value="part_time">パート</option><option value="viewer">閲覧のみ</option></select></div><label class="field">有効<input class="staff-active" data-id="${s.id}" type="checkbox" ${s.isActive ? "checked" : ""}></label></div><div class="permission-checks"><label><input class="p-child" data-id="${s.id}" type="checkbox" ${s.permissions.canManageChildren ? "checked" : ""}>児童管理</label><label><input class="p-guardian" data-id="${s.id}" type="checkbox" ${s.permissions.canApproveGuardians ? "checked" : ""}>保護者承認</label><label><input class="p-pickup" data-id="${s.id}" type="checkbox" ${s.permissions.canApprovePickup ? "checked" : ""}>お迎え承認</label><label><input class="p-health" data-id="${s.id}" type="checkbox" ${s.permissions.canViewHealthData ? "checked" : ""}>健康情報</label><label><input class="p-incident" data-id="${s.id}" type="checkbox" ${s.permissions.canManageIncidents ? "checked" : ""}>事故管理</label></div><button class="btn primary staff-save" data-id="${s.id}" data-version="${s.version}" type="button">権限を保存</button></article>`).join("");
    (staffData?.staff || []).forEach(s => { const el = document.querySelector(`.staff-role[data-id="${s.id}"]`); if (el) el.value = s.role; });
    $$(".staff-save").forEach(b => b.onclick = () => saveStaff(b));
  }

  async function saveStaff(b) {
    const id = b.dataset.id; if (!confirm("職員権限を更新しますか？")) return;
    const get = (cls) => document.querySelector(`.${cls}[data-id="${id}"]`);
    try {
      await A.ownerApi(`/admin/staff/${id}/permissions`, { method: "POST", body: {
        role: get("staff-role").value, isActive: get("staff-active").checked,
        canManageChildren: get("p-child").checked, canApproveGuardians: get("p-guardian").checked,
        canApprovePickup: get("p-pickup").checked, canViewHealthData: get("p-health").checked,
        canManageIncidents: get("p-incident").checked, expectedVersion: Number(b.dataset.version)
      }});
      await loadStaff(); renderStaff(); status("職員権限を更新しました。");
    } catch (e) { status(e.message, "error"); }
  }

  function renderCapacity() {
    if (!capacityData) return;
    const sm = capacityData.summary || {};
    const items=[["受付中期間",sm.openPeriods||0],["申請待ち",sm.pendingApplications||0],["一部承認",sm.partiallyApproved||0],["満員日",sm.daysFull||0],["受入停止",sm.daysClosed||0],["曜日待機",sm.enrollmentWaiting||0]];
    $("#capacitySummary").innerHTML=items.map(([k,v],i)=>`<article class="owner-summary-card ${[1,3,4,5].includes(i)&&Number(v)?"alert-card":""}"><span>${esc(k)}</span><strong>${v}</strong></article>`).join("");
    $("#holidayPeriodList").innerHTML=(capacityData.periods||[]).map(p=>`<article class="owner-row"><div><strong>${esc(p.periodName)}</strong><p>${p.startDate}〜${p.endDate}・定員${p.capacity||"-"}・申請${p.applicationCount}件</p></div><button class="mini period-edit" data-id="${p.id}" type="button">編集</button></article>`).join("")||'<p class="muted">期間設定はありません。</p>';
    $$(".period-edit").forEach(b=>b.onclick=()=>editPeriod(b.dataset.id));
    $("#capacityCalendar").innerHTML=(capacityData.capacityDays||[]).map(d=>`<article class="capacity-day ${d.closed?"closed":d.remaining===0?"full":d.remaining<=3?"limited":""}"><div><strong>${d.date}</strong><p>${d.period?.periodName||"通常日"}</p></div><div class="capacity-numbers"><b>${d.reservedCount}/${d.capacity}</b><small>待機 ${d.waitlistCount}</small></div><input class="control capacity-input" data-date="${d.date}" type="number" min="0" max="500" value="${d.capacity}"><label><input class="capacity-closed" data-date="${d.date}" type="checkbox" ${d.closed?"checked":""}>停止</label><button class="mini capacity-save" data-date="${d.date}" type="button">保存</button></article>`).join("");
    $$(".capacity-save").forEach(b=>b.onclick=()=>saveCapacityDay(b.dataset.date));
    $("#holidayApplications").innerHTML=(capacityData.applications||[]).map(a=>holidayApplicationCard(a)).join("")||'<p class="muted">申請はありません。</p>';
    $$(".holiday-review-save").forEach(b=>b.onclick=()=>reviewHolidayApplication(b.dataset.id));
    $("#waitingList").innerHTML=(capacityData.waitingList||[]).map(w=>`<article class="request-card"><div class="section-head"><div><strong>${esc(w.childName)}</strong><p>${(w.desiredWeekdays||[]).map(x=>["日","月","火","水","木","金","土"][x]).join("・")}希望</p></div>${chip(w.status,w.status==="waiting"?"warn":"")}</div><div class="request-actions"><button class="btn secondary wait-priority" data-id="${w.id}" data-priority="${w.priority}" type="button">優先度 ${w.priority}</button>${w.status==="waiting"?`<button class="btn primary wait-offer" data-id="${w.id}" type="button">利用案内</button>`:""}</div></article>`).join("")||'<p class="muted">待機登録はありません。</p>';
    $$(".wait-priority").forEach(b=>b.onclick=()=>waitlistAction(b.dataset.id,"priority",b.dataset.priority));
    $$(".wait-offer").forEach(b=>b.onclick=()=>waitlistAction(b.dataset.id,"offer"));
  }
  function holidayApplicationCard(a){const pending=a.status==="pending";return `<article class="request-card holiday-application"><div class="section-head"><div><strong>${esc(a.childName)}・${esc(a.periodName)}</strong><p>${a.requestedDates.length}日申請／${esc(a.guardianName||"")}</p></div>${chip(label(a.status),pending?"warn":"")}</div><p>${esc(a.guardianNote||"")}</p><div class="holiday-review-days">${a.requestedDates.map(d=>`<label><span>${d}</span><select class="control holiday-decision" data-app="${a.id}" data-date="${d}" ${pending?"":"disabled"}><option value="approved">承認</option><option value="waitlisted">待機</option><option value="rejected">却下</option></select></label>`).join("")}</div>${pending?`<div class="field"><label>審査メモ</label><textarea class="control holiday-note" data-app="${a.id}"></textarea></div><button class="btn primary holiday-review-save" data-id="${a.id}" type="button">利用日を確定</button>`:`<p class="muted">承認 ${(a.approvedDates||[]).length}日／待機 ${(a.waitlistedDates||[]).length}日／却下 ${(a.rejectedDates||[]).length}日</p>`}</article>`}
  async function reviewHolidayApplication(id){if(!confirm("日ごとの承認・待機・却下を確定しますか？"))return;const selects=$$(`.holiday-decision[data-app="${id}"]`),body={approvedDates:[],waitlistedDates:[],rejectedDates:[],decisionNote:document.querySelector(`.holiday-note[data-app="${id}"]`)?.value||""};selects.forEach(x=>body[`${x.value}Dates`].push(x.dataset.date));try{await A.ownerApi(`/admin/holiday-applications/${id}/review`,{method:"POST",body});await loadCapacity();renderCapacity();status("長期休暇申請を確定しました。")}catch(e){status(e.message,"error")}}
  async function saveCapacityDay(date){const cap=Number(document.querySelector(`.capacity-input[data-date="${date}"]`).value),closed=document.querySelector(`.capacity-closed[data-date="${date}"]`).checked;let reason="";if(closed)reason=prompt("受入停止理由","施設点検")||"";try{await A.ownerApi('/admin/daily-capacity/upsert',{method:'POST',body:{date,capacity:cap,closed,closeReason:reason}});await loadCapacity();renderCapacity();status("日別定員を更新しました。")}catch(e){status(e.message,"error")}}
  function editPeriod(id){const p=(capacityData.periods||[]).find(x=>x.id===id);if(!p)return;$("#periodId").value=p.id;$("#periodName").value=p.periodName;$("#periodType").value=p.periodType;$("#periodStart").value=p.startDate;$("#periodEnd").value=p.endDate;$("#periodCapacity").value=p.capacity||40;$("#periodStatus").value=p.status;$("#periodNotes").value=p.notes||"";$("#holidayPeriodForm").classList.remove("hidden")}
  async function savePeriod(e){e.preventDefault();const body={periodId:$("#periodId").value||null,periodName:$("#periodName").value,periodType:$("#periodType").value,startDate:$("#periodStart").value,endDate:$("#periodEnd").value,applicationOpenAt:$("#periodApplyOpen").value?new Date($("#periodApplyOpen").value).toISOString():null,applicationCloseAt:$("#periodApplyClose").value?new Date($("#periodApplyClose").value).toISOString():null,defaultOpeningTime:"08:00",defaultClosingTime:"19:00",capacity:Number($("#periodCapacity").value),status:$("#periodStatus").value,notes:$("#periodNotes").value};try{await A.ownerApi('/admin/holiday-periods/upsert',{method:'POST',body});e.target.classList.add('hidden');await loadCapacity();renderCapacity();status("長期休暇期間を保存しました。")}catch(x){status(x.message,"error")}}
  async function waitlistAction(id,action,current){const body={action};if(action==="priority")body.priority=Number(prompt("優先順位（小さいほど優先）",current)||current);if(action==="offer"){const d=new Date(Date.now()+7*86400000);body.offerExpiresAt=d.toISOString();body.note=prompt("利用案内メモ","空きが出たためご案内")||""}try{await A.ownerApi(`/admin/waiting-list/${id}/action`,{method:'POST',body});await loadCapacity();renderCapacity();status("待機登録を更新しました。")}catch(e){status(e.message,"error")}}

  const notificationLabel = (v) => ({arrival_overdue:"入室超過",departure_overdue:"退室超過",allergy_warning:"アレルギー",request_due:"申請期限",holiday_deadline:"長期休暇締切",holiday_application_pending:"長期休暇未審査",line_link_pending:"LINE承認待ち",handoff_urgent:"重要申し送り",incident_critical:"重大事故",capacity_full:"満員",capacity_closed:"受入停止",waitlist_offer_expiry:"待機回答期限",arrival_notice:"入室通知",departure_notice:"退室通知",announcement:"お知らせ",pending:"送信待ち",held:"保留",sending:"送信中",sent:"送信済み",failed:"失敗",open:"未対応",acknowledged:"確認済み",resolved:"解決",suppressed:"非表示",warning:"注意",high:"重要",critical:"緊急",info:"情報"}[v]||v||"-");
  function renderNotifications(){
    if(!notificationData)return; const x=notificationData.summary||{};
    const sums=[["未完了警告",x.openAlerts||0],["緊急警告",x.criticalAlerts||0],["送信待ち",x.pendingJobs||0],["保留",x.heldJobs||0],["本日送信",x.sentToday||0],["失敗",x.failedJobs||0]];
    $("#notificationSummary").innerHTML=sums.map(([k,v],i)=>`<article class="owner-summary-card ${(i===0||i===1||i===5)&&Number(v)?"alert-card":""}"><span>${k}</span><strong>${v}</strong></article>`).join("");
    $("#notificationAlerts").innerHTML=(notificationData.alerts||[]).map(a=>`<article class="notification-card severity-${esc(a.severity)}"><div class="section-head"><div><h3>${esc(a.title)}</h3><div class="notification-meta">${chip(notificationLabel(a.alertType),a.severity==="critical"?"danger":a.severity==="high"?"warn":"")}${chip(notificationLabel(a.status))}${a.childName?`<span>${esc(a.childName)}</span>`:""}</div></div><small>${dateTime(a.dueAt||a.createdAt)}</small></div><p>${esc(a.body)}</p>${["open","acknowledged"].includes(a.status)?`<div class="notification-card-actions">${a.status==="open"?`<button class="btn secondary notification-alert-action" data-id="${a.id}" data-action="acknowledge" type="button">確認済み</button>`:""}<button class="btn primary notification-alert-action" data-id="${a.id}" data-action="resolve" type="button">解決</button><button class="btn danger notification-alert-action" data-id="${a.id}" data-action="suppress" type="button">非表示</button></div>`:""}</article>`).join("")||'<p class="muted">該当する警告はありません。</p>';
    $("#notificationJobs").innerHTML=(notificationData.jobs||[]).slice(0,80).map(j=>`<article class="notification-card notification-job-${esc(j.status)}"><div class="section-head"><div><h3>${esc(j.title)}</h3><div class="notification-meta">${chip(notificationLabel(j.eventType))}${chip(notificationLabel(j.status),j.status==="failed"?"danger":j.status==="held"?"warn":"")}</div></div><small>${dateTime(j.createdAt)}</small></div><p>${esc(j.recipientName||j.childName||"-")}／${esc(j.body)}</p>${j.holdReason?`<p class="muted">保留理由：${esc(j.holdReason)}</p>`:""}${j.lastErrorMessage?`<p class="alert">${esc(j.lastErrorMessage)}</p>`:""}${["held","failed"].includes(j.status)?`<button class="mini notification-job-retry" data-id="${j.id}" type="button">再試行</button>`:""}</article>`).join("")||'<p class="muted">通知履歴はありません。</p>';
    $("#notificationRuns").innerHTML=(notificationData.runs||[]).map(r=>`<article class="notification-run"><strong>${esc(r.triggerType)}・${esc(r.status)}</strong><small>${dateTime(r.startedAt)}</small><p>準備 ${r.prepared}／待ち ${r.pending}／保留 ${r.held}／送信 ${r.sent}／失敗 ${r.failed}</p></article>`).join("")||'<p class="muted">自動確認履歴はありません。</p>';
    $$(".notification-alert-action").forEach(b=>b.onclick=()=>notificationAlertAction(b.dataset.id,b.dataset.action));
    $$(".notification-job-retry").forEach(b=>b.onclick=()=>notificationRetry(b.dataset.id));
  }
  async function notificationAlertAction(id,action){const note=action==="resolve"||action==="suppress"?(prompt("対応メモ","")||""):"";try{await A.ownerApi(`/admin/notifications/alerts/${id}/action`,{method:"POST",body:{action,note}});await loadNotifications();renderNotifications();status("警告を更新しました。")}catch(e){status(e.message,"error")}}
  async function notificationRetry(id){try{await A.ownerApi(`/admin/notifications/jobs/${id}/retry`,{method:"POST",body:{}});await loadNotifications();renderNotifications();status("通知を再試行キューへ戻しました。")}catch(e){status(e.message,"error")}}
  async function prepareNotifications(){try{const result=await A.ownerApi('/admin/notifications/prepare',{method:'POST',body:{}});await loadNotifications();renderNotifications();status(`自動確認を実行しました（警告${result.alertsPrepared||0}・通知${result.jobsPrepared||0}）。`)}catch(e){status(e.message,"error")}}

  async function loadAudit() {
    const q = $("#auditQuery").value.trim();
    const data = await A.ownerApi(`/admin/audit-logs?query=${encodeURIComponent(q)}&limit=150`);
    $("#auditList").innerHTML = (data.logs || []).map(a => `<article class="audit-card"><div class="section-head"><strong>${esc(a.action)}</strong><span>${dateTime(a.createdAt)}</span></div><p>実行者：${esc(a.actorId || a.actorType)}／対象：${esc(a.entityType || "-")} ${esc(a.entityId || "")}</p><small>${esc(a.requestId || "")}</small></article>`).join("") || '<p class="muted">操作履歴はありません。</p>';
  }

  function showView(name) {
    $$(".owner-view").forEach(v => v.classList.add("hidden"));
    $$(".owner-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    $(`#view${name.charAt(0).toUpperCase() + name.slice(1)}`).classList.remove("hidden");
    if (name === "audit") loadAudit().catch(e => status(e.message, "error"));
  }

  async function runSystemCheck() {
    try {
      const result = await A.ownerApi("/admin/system-check");
      $("#systemResult").textContent = JSON.stringify(result, null, 2);
      status(result.ok ? "一括確認は正常です。" : "検査に注意項目があります。", result.ok ? "ok" : "error");
    } catch (e) { $("#systemResult").textContent = e.message; status(e.message, "error"); }
  }

  $("#ownerDate").value = jstToday();
  $("#capacityFrom").value = jstToday();
  $("#capacityTo").value = addDays(jstToday(),60);
  $("#ownerFacilityCode").value = C.facilityCode;
  $("#ownerStaffCode").value = C.demo.managerCode;
  $("#ownerVersion").textContent = C.version;
  $("#ownerDemoLogin").onclick = () => login(C.demo.managerCode, C.demo.accessCode).catch(e => status(e.message, "error"));
  $("#ownerLoginBtn").onclick = () => login($("#ownerStaffCode").value, $("#ownerAccessCode").value).catch(e => status(e.message, "error"));
  $("#ownerClearCode").onclick = () => { $("#ownerAccessCode").value = ""; $("#ownerAccessCode").focus(); };
  $("#ownerLogout").onclick = async () => { try { await A.ownerApi("/auth/logout", { method: "POST" }); } catch {} A.setOwnerToken(""); setLogged(false); };
  $("#ownerReload").onclick = () => loadAll().then(() => status("全体を更新しました。")).catch(e => status(e.message, "error"));
  $("#ownerDate").onchange = () => loadDashboard().then(() => { renderDashboard(); renderSafety(); }).catch(e => status(e.message, "error"));
  $("#requestStatus").onchange = () => loadRequests().then(renderRequests).catch(e => status(e.message, "error"));
  $("#lineStatus").onchange = () => loadLineRequests().then(renderLineRequests).catch(e => status(e.message, "error"));
  $("#childSearchBtn").onclick = () => loadFamily().then(renderChildren).catch(e => status(e.message, "error"));
  $("#childSearchClear").onclick = () => { $("#childSearch").value = ""; $("#childStatus").value = ""; loadFamily().then(renderChildren).catch(e => status(e.message, "error")); };
  $("#newChild").onclick = newChild;
  $("#auditSearch").onclick = () => loadAudit().catch(e => status(e.message, "error"));
  $("#auditClear").onclick = () => { $("#auditQuery").value = ""; loadAudit().catch(e => status(e.message, "error")); };
  $("#runSystemCheck").onclick = runSystemCheck;
  $("#capacityReload").onclick = () => loadCapacity().then(renderCapacity).catch(e => status(e.message,"error"));
  $("#notificationReload").onclick = () => loadNotifications().then(renderNotifications).catch(e => status(e.message,"error"));
  $("#notificationPrepare").onclick = prepareNotifications;
  $("#notificationStatus").onchange = () => loadNotifications().then(renderNotifications).catch(e => status(e.message,"error"));
  $("#newHolidayPeriod").onclick = () => { $("#holidayPeriodForm").reset(); $("#periodId").value=""; $("#periodCapacity").value=40; $("#holidayPeriodForm").classList.toggle("hidden"); };
  $("#holidayPeriodForm").onsubmit = savePeriod;
  $$(".owner-nav button").forEach(b => b.onclick = () => showView(b.dataset.view));
  $$(".jump-view").forEach(b => b.onclick = () => showView(b.dataset.target));

  (async () => {
    if (A.getOwnerToken()) {
      try { await loadAll(); } catch { A.setOwnerToken(""); setLogged(false); }
    }
  })();
})();
