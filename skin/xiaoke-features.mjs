// ============================================================================
// 小克功能补丁（xiaoke features）—— 动态小克 + 余额预警时自动换哭脸 + 状态记号
// ============================================================================
// 主题文件（xiaoke-theme.mjs）只负责「换皮」：改名、配色、台词。这里放的是新增**功能**，
// 由 tools/build-xiaoke.mjs 在其余步骤都跑完之后，对产物做逐字替换。
//
// 和主题里的 EXACT 不同：这里每一条都必须命中预期次数（count，默认 1），
// 否则构建直接失败 —— 上游改了相关代码时能立刻发现，而不是功能静默失效。
//
// 功能：角色列表里多两个内置角色（素材在 assets/xiaoke-anim[-cry]-{256,384}.webp）
//   「小克（动态）」       anim       ：会呼吸、会眨眼的日常表情，永远不哭
//   「小克（含余额预警）」 anim-mood  ：平时一样；「余额预警」触发（余额 ≤ 预警线）时换成大泪珠哭脸，
//                                      余额回到预警线以上换回来；余额预警关掉就不哭
// 默认的静态小克、用户导入的角色都不受影响。临时换图不经过 applyRole，不会改掉用户选的角色。
// 素材按挂件实际显示的物理像素挑够用的最小一档。浏览器会把动图的每一帧解码后留在内存和显存里，
// 档位越大占得越多：插件只带 256 / 384 两档（默认大小用 256 就够）；512 高清档是可选的高清包，
// 放在 GitHub Releases，用户下载后在「资源管理 → 动态小克 · 高清档」里选文件安装，装了以后挂件调大才用。
//
// 状态记号：小克头上冒一个记号说明 DSH 现在的状态（和桌宠 XiaokePet 一样）——
//   「!」在等你回答或授权、冒汗是上一轮出错了、「…」有会话在跑、zzz 是你 10 分钟没碰页面，她睡着了
//   （两个内置动态小克换成闭眼的睡脸 assets/xiaoke-anim-sleep-{256,384}.webp，一碰页面就醒）。
//   宿主记下各会话的 turn/start、turn/end，随 wait.json 一起给前端；菜单「状态记号」可以关掉。
// ============================================================================

// 高清包：两个下载地址（动图作者的 fork 和本仓库各发一份 Release，传的是同一个 zip，一个不能用了还有另一个），
// 和包里两个文件的 SHA-256（tools/pack-anim-hd.mjs 打包时会打印）。只装核对得上的文件。
const HD_URLS = [
  'https://github.com/AirsEDA/dsh-xiaoke-widget/releases/download/xiaoke-anim-hd-v1/xiaoke-anim-hd.zip',
  'https://github.com/aklnaaw/dsh-xiaoke-widget/releases/download/xiaoke-anim-hd-v1/xiaoke-anim-hd.zip',
]
const HD_FILES = {
  'xiaoke-anim-512.webp': 'ac1e52cc2fe0c0b5fd89b42b80b18ce0e7b51910d5ea8d3b77e15ce321afdfeb',
  'xiaoke-anim-cry-512.webp': '5a6844667d246fa804c2bb291049989a5e4c87ab0de30d8a0475a708270850a1',
}

const isAnim = v => `xkIsAnim(${v})`

const MOOD_CODE = `// —— 内置动态小克（skin/xiaoke-features.mjs）——
// 「小克（动态）」只有日常表情；「小克（含余额预警）」在余额预警触发时换成哭脸。
// 沿用「余额预警」的开关和阈值：余额 ≤ 预警线就哭，回到预警线以上换回来；预警关掉就不哭。
// 睡着时（见下面的状态记号）两个都换成闭眼的睡脸，醒了换回日常 / 哭脸。
var xkCrying = false
var xkSleeping = false
var xkLowBalance = false
function xkIsAnim(id) { return id === 'anim' || id === 'anim-mood' }
// 挂件在屏幕上的物理像素 ≤256 用 256 档，再大用 384；装了高清包、超过 384 时用 512
function xkAnimRes() {
  var w = 0
  try { w = img.getBoundingClientRect().width } catch (err) {}
  var px = (w || 120) * (window.devicePixelRatio || 1)
  return px > 384 && xkHdInstalled ? 512 : px > 256 ? 384 : 256
}
// face：'anim' 日常 / 'anim-cry' 哭脸 / 'anim-sleep' 睡脸（睡脸没有 512 档，宿主退回 384）
function xkAnimUrl(face) {
  return '/dsh-xiaoke/' + face + '.webp?r=' + xkAnimRes()
}
// 现在该是哪张脸：睡着了是睡脸（哭着睡着也闭眼），醒着、余额低是哭脸
function xkFace() { return xkSleeping ? 'anim-sleep' : xkCrying ? 'anim-cry' : 'anim' }
function xkShowImage(url) {
  img.src = url
  hitReady = false
  hitFailed = false
  setupHitTest(url)
}
// 按现在的状态和挂件大小换图（只管两个内置动态小克）；currentRole.url 一直记日常图
function xkShowFace() {
  if (!currentRole || !xkIsAnim(currentRole.id)) return
  currentRole.url = xkAnimUrl('anim')
  var want = xkAnimUrl(xkFace())
  if (img.src.slice(-want.length) !== want) xkShowImage(want)
}
function xkSetCrying(cry) {
  // 只有「小克（含余额预警）」会哭
  if (cry && !(currentRole && currentRole.id === 'anim-mood')) cry = false
  if (cry === xkCrying) return
  xkCrying = cry
  xkShowFace()
}
function xkSetSleeping(on) {
  on = !!on
  if (on === xkSleeping) return
  xkSleeping = on
  xkShowFace()
}
// 挂件大小变了（页面刚排好版、拖了「大小」滑块、窗口缩放）就重新挑档位
var xkResTimer = null
function xkCheckRes() {
  try { if (!img.getBoundingClientRect().width) return } catch (err) { return } // 没显示出来时不换
  xkShowFace()
}
try {
  new ResizeObserver(function () {
    clearTimeout(xkResTimer)
    xkResTimer = setTimeout(xkCheckRes, 300)
  }).observe(img)
} catch (err) {}
function xkUpdateMood(balance) {
  var a = usageSet && usageSet.alert
  var below = a ? Number(a.below) : NaN
  xkLowBalance = !!(a && a.on && typeof balance === 'number' && isFinite(balance) && isFinite(below) && balance <= below)
  xkSetCrying(xkLowBalance)
}
// 换了角色：applyRole 已经显示了新角色的日常图，再按当前余额、睡没睡决定换哪张脸
function xkReapplyMood() {
  xkCrying = xkLowBalance && !!currentRole && currentRole.id === 'anim-mood'
  xkShowFace()
}
// —— 512 高清档（可选）：「资源管理 → 动态小克 · 高清档」里下载高清包、选文件安装 / 卸载 ——
var XK_HD_URLS = ${JSON.stringify(HD_URLS)}
var xkHdInstalled = false
var xkHdMsg = ''
function xkHdSet(on) {
  on = !!on
  if (on === xkHdInstalled) return
  xkHdInstalled = on
  xkCheckRes()
}
try {
  fetch('/dsh-xiaoke/anim-hd.json', { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(function (d) { xkHdSet(d && d.installed) })
    .catch(function () {})
} catch (err) {}
// 各档运行时比静态小克多占的内存 / 显存（作者电脑上的 Edge 实测）
var XK_HD_USAGE = [
  '运行时比静态小克多占（实测，因电脑而异）：',
  '· 256 档（默认大小）：内存约 30 MB，显存约 40 MB',
  '· 384 档：内存约 100 MB，显存约 100 MB',
  '· 512 档（高清包）：内存约 190 MB，显存约 200 MB',
  '用核显的电脑，显存也是从内存里划的。',
]
function xkHdSection(wrap) {
  var ent = resFoldEntry(wrap, 'xkhd', '动态小克 · 高清档', xkHdInstalled ? '512 档已安装 · 占硬盘约 18 MB' : '可选下载 · 约 18 MB')
  var tip = document.createElement('div')
  tip.className = 'dshxkv-resempty'
  tip.style.whiteSpace = 'pre-line'
  var lines = xkHdInstalled
    ? ['已安装，占硬盘约 18 MB。挂件在屏幕上超过 384 物理像素时改用 512 档，不需要了可以卸载（卸载后最大用 384 档）。'].concat(XK_HD_USAGE)
    : ['插件自带 256 / 384 两档，默认大小够用。想把挂件调得很大又不想糊，可以另装 512 高清档：下载约 18 MB，装好占硬盘约 18 MB，只在挂件超过 384 物理像素时才用。']
      .concat(XK_HD_USAGE, ['先下载高清包（下载不了就点「备用下载」，是同一个文件），再点「安装…」选中下载的 zip。'])
  if (xkHdMsg) lines.unshift(xkHdMsg)
  tip.textContent = lines.join('\\n')
  ent.body.appendChild(tip)
  var row = document.createElement('div')
  row.className = 'dshxkv-resrow'
  if (xkHdInstalled) {
    row.appendChild(resMkDel('卸载', false, xkHdRemove))
  } else {
    XK_HD_URLS.forEach(function (url, i) {
      var dl = document.createElement('a')
      dl.className = 'dshxkv-resimp'
      dl.href = url
      dl.target = '_blank'
      dl.rel = 'noopener noreferrer'
      dl.style.textDecoration = 'none'
      dl.textContent = i === 0 ? '下载高清包' : '备用下载'
      row.appendChild(dl)
    })
    row.appendChild(resMkBtn('dshxkv-resimp', '安装…', false, xkHdPick))
  }
  ent.body.appendChild(row)
}
function xkHdPost(body) {
  return fetch('/dsh-xiaoke/anim-hd.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(function (r) { return r.json() })
    .then(function (d) {
      xkHdMsg = d && d.ok ? '' : '没装上：' + ((d && d.error) || '未知错误')
      xkHdSet(d && d.installed)
      resFoldOpen.xkhd = true
      openResManager()
    })
}
function xkHdPick() {
  var input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip,.webp'
  input.multiple = true
  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call(input.files || [])
    if (!files.length) return
    xkHdMsg = '正在安装…'
    resFoldOpen.xkhd = true
    openResManager()
    Promise.all(files.map(function (f) {
      return new Promise(function (ok, bad) {
        var fr = new FileReader()
        fr.onload = function () { ok({ name: f.name, data: String(fr.result || '') }) }
        fr.onerror = bad
        fr.readAsDataURL(f)
      })
    }))
      .then(function (list) { return xkHdPost({ action: 'install', files: list }) })
      .catch(function () { xkHdMsg = '没装上：读不了选中的文件'; openResManager() })
  })
  input.click()
}
function xkHdRemove() {
  showConfirm('卸载 512 高清档吗？\\n卸载后挂件最大只用 384 档。', function () {
    xkHdPost({ action: 'remove' }).catch(function () {})
  }, '卸载')
}
`

const MARK_CODE = `// —— 状态记号（skin/xiaoke-features.mjs）——
// 和桌宠 XiaokePet 一样，小克头上冒一个记号说明 DSH 现在的状态。同时只冒一个，按这个顺序挑：
//   「!」 有提问或授权在等你（wait.json 的 pending）
//   冒汗  上一轮出错了（宿主记的 turn/end 出错；那个会话开始下一轮，或者过了 30 分钟就不冒了）
//   「…」 有会话在跑（turn/start 到 turn/end 之间，不算子智能体）
//   zzz   上面都没有、你又 10 分钟没碰这个页面：睡着了，内置动态小克换成闭眼的睡脸；一碰页面就醒
// 数据随 wait.json 每秒来一次（宿主加了 activity 字段），不另开轮询。
// 菜单「状态记号」可以整个关掉（键 = settings.marks.on，默认开；关掉后也不会睡着）。
var XK_SLEEP_MS = 10 * 60 * 1000
var xkMark = ''
var xkLastInput = Date.now()
var xkAct = { pending: false, running: 0, errorAt: 0 }
var xkMarkBox = document.createElement('div')
xkMarkBox.className = 'dshxkv-xkmark'
xkMarkBox.innerHTML =
  '<div class="dshxkv-xkm dshxkv-xkm-dots"><span></span><span></span><span></span></div>' +
  '<div class="dshxkv-xkm dshxkv-xkm-bang"><span>!</span></div>' +
  '<div class="dshxkv-xkm dshxkv-xkm-sweat"><svg viewBox="-0.5 -0.5 11 16.5"><path d="M5 0C5 0 10 7 10 10.5A5 5 0 1 1 0 10.5C0 7 5 0 5 0Z"/></svg></div>' +
  '<div class="dshxkv-xkm dshxkv-xkm-zzz"><span>z</span><span>Z</span><span>z</span></div>'
// 和角色图放在同一个容器里（按压时跟着一起压扁、拖动时一起走），记号都在头的右侧，不和泡泡叠在一起
try { img.parentNode.appendChild(xkMarkBox) } catch (err) {}
function xkMarksOn() {
  return !(usageSet && usageSet.marks && usageSet.marks.on === false)
}
function xkPickMark() {
  if (!xkMarksOn()) return ''
  if (xkAct.pending) return 'bang'
  if (xkAct.errorAt) return 'sweat'
  if (xkAct.running > 0) return 'dots'
  if (Date.now() - xkLastInput >= XK_SLEEP_MS) return 'zzz'
  return ''
}
function xkUpdateMark() {
  var m = xkPickMark()
  if (m === xkMark) return
  xkMark = m
  xkMarkBox.setAttribute('data-mark', m)
  xkSetSleeping(m === 'zzz')
}
// pollWaitState 每秒拿到 wait.json 后调这里
function xkMarkPoll(d) {
  var a = d.activity || {}
  xkAct = { pending: !!(d.pending && d.pending.kind), running: Number(a.running) || 0, errorAt: Number(a.errorAt) || 0 }
  if (xkMarksChk.checked !== xkMarksOn()) xkMarksChk.checked = xkMarksOn()
  xkUpdateMark()
}
// 菜单「状态记号」
function xkSetMarksOn(on) {
  usageSet = usageSet || {}
  usageSet.marks = { on: !!on }
  saveUsageSettings({ marks: { on: !!on } })
  xkUpdateMark()
}
// 页面里有任何操作就算你在（睡着了马上醒），切回这个标签页也算
function xkSeen() {
  xkLastInput = Date.now()
  if (xkMark === 'zzz') xkUpdateMark()
}
try {
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(function (t) {
    document.addEventListener(t, xkSeen, { capture: true, passive: true })
  })
  document.addEventListener('visibilitychange', function () { if (!document.hidden) xkSeen() })
} catch (err) {}
`

// 记号的样式，插进挂件的 css 数组。位置、大小、颜色、动画节奏照桌宠 XiaokePet（PetWindow.Sessions.cs），
// 尺寸按角色图的框算（--dshxk-art，和 .dshxkv-img 一样是挂件边长的 59.45%）。
// 和桌宠不一样的两处：「…」挪到头的右上方（见下面），点换成皮肤的珊瑚色
const MARK_CSS = [
  '.dshxkv-xkmark{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;pointer-events:none;z-index:2;--dshxk-art:calc(var(--dshxk-base) * .5945);--dshxk-d:max(3px,calc(var(--dshxk-art) * .028))}',
  '.dshxkv-xkm{position:absolute;display:none;transition:transform .3s ease}',
  '.dshxkv-xkmark[data-mark="dots"] .dshxkv-xkm-dots,.dshxkv-xkmark[data-mark="bang"] .dshxkv-xkm-bang,.dshxkv-xkmark[data-mark="sweat"] .dshxkv-xkm-sweat,.dshxkv-xkmark[data-mark="zzz"] .dshxkv-xkm-zzz{display:block}',
  // 挂件在左半边时整个镜像了：记号自己再翻回来，不然字是反的
  '.dshxkv-root.dshxkv-left .dshxkv-xkm{transform:scaleX(-1)}',
  // 「…」：小泡泡里三个点轮流跳。桌宠把它放在头的左上方，挂件的泡泡也在那儿（余额预警的泡泡默认不自动关），
  // 所以挪到右上方，和其它记号一边，不会和泡泡叠在一起
  '.dshxkv-xkm-dots{left:64%;top:-1%;padding:calc(var(--dshxk-d) * 1.1) calc(var(--dshxk-d) * 1.1) calc(var(--dshxk-d) * .8);background:#faf9f5;border:1.2px solid rgba(217,119,87,.5);border-radius:calc(var(--dshxk-d) * 2);line-height:0;font-size:0;white-space:nowrap}',
  '.dshxkv-xkm-dots span{display:inline-block;width:var(--dshxk-d);height:var(--dshxk-d);margin:0 calc(var(--dshxk-d) * .35);border-radius:50%;background:#d97757;animation:dshxkv-xkm-jump 1.2s infinite}',
  '.dshxkv-xkm-dots span:nth-child(2){animation-delay:.16s}',
  '.dshxkv-xkm-dots span:nth-child(3){animation-delay:.32s}',
  '@keyframes dshxkv-xkm-jump{0%{transform:translateY(0);animation-timing-function:cubic-bezier(.5,1,.89,1)}18%{transform:translateY(calc(var(--dshxk-d) * -.8));animation-timing-function:cubic-bezier(.11,0,.5,0)}36%,100%{transform:translateY(0)}}',
  // 「!」：一跳一跳
  '.dshxkv-xkm-bang{left:74%;top:-3%;line-height:1}',
  '.dshxkv-xkm-bang span{display:block;font-size:max(14px,calc(var(--dshxk-art) * .14));font-weight:900;color:#ef9f27;transform-origin:50% 100%;animation:dshxkv-xkm-pulse 1.4s infinite}',
  '@keyframes dshxkv-xkm-pulse{0%{transform:scale(1);animation-timing-function:cubic-bezier(.5,1,.89,1)}12%{transform:scale(1.25);animation-timing-function:cubic-bezier(.11,0,.5,0)}30%,100%{transform:scale(1)}}',
  // 冒汗：一滴汗慢慢往下滑，快到底时淡出
  '.dshxkv-xkm-sweat{left:77%;top:26%;width:max(8px,calc(var(--dshxk-art) * .07))}',
  '.dshxkv-xkm-sweat svg{display:block;width:100%;aspect-ratio:2/3;overflow:visible;animation:dshxkv-xkm-drip 1.6s cubic-bezier(.11,0,.5,0) infinite,dshxkv-xkm-dripfade 1.6s linear infinite}',
  '.dshxkv-xkm-sweat path{fill:#b5d4f4;stroke:#378add;stroke-width:.9}',
  '@keyframes dshxkv-xkm-drip{0%{transform:translateY(0)}100%{transform:translateY(60%)}}',
  '@keyframes dshxkv-xkm-dripfade{0%,70%{opacity:1}100%{opacity:0}}',
  // zzz：「z Z z」一个接一个往上飘、淡出
  '.dshxkv-xkm-zzz{left:64%;top:-6%;width:calc(var(--dshxk-art) * .3);height:calc(var(--dshxk-art) * .26)}',
  '.dshxkv-xkm-zzz span{position:absolute;font-weight:700;line-height:1;color:#7f77dd;opacity:.85;animation:dshxkv-xkm-rise 2.4s linear infinite}',
  '.dshxkv-xkm-zzz span:nth-child(1){left:calc(var(--dshxk-art) * .02);top:calc(var(--dshxk-art) * .15);font-size:max(9px,calc(var(--dshxk-art) * .06))}',
  '.dshxkv-xkm-zzz span:nth-child(2){left:calc(var(--dshxk-art) * .095);top:calc(var(--dshxk-art) * .095);font-size:max(9px,calc(var(--dshxk-art) * .082));animation-delay:.7s}',
  '.dshxkv-xkm-zzz span:nth-child(3){left:calc(var(--dshxk-art) * .17);top:calc(var(--dshxk-art) * .04);font-size:max(9px,calc(var(--dshxk-art) * .104));animation-delay:1.4s}',
  '@keyframes dshxkv-xkm-rise{0%{transform:translateY(0);opacity:.85}60%{opacity:.85}100%{transform:translateY(calc(var(--dshxk-art) * -.07));opacity:0}}',
  '@media (prefers-reduced-motion:reduce){.dshxkv-xkm *{animation:none !important}}',
]
for (const rule of MARK_CSS) {
  if (/['\\\n]/.test(rule)) throw new Error('MARK_CSS 里不能有单引号、反斜杠或换行：' + rule)
}

const MARK_MENU = `
// —— 状态记号开关（skin/xiaoke-features.mjs）：存在 settings.marks.on，默认开 ——
var xkMarksChk = document.createElement('input')
xkMarksChk.type = 'checkbox'
xkMarksChk.className = 'dshxkv-check'
xkMarksChk.checked = true
xkMarksChk.title = '小克头上冒记号：「…」有会话在跑，「!」在等你回答或授权，冒汗是上一轮出错了；你 10 分钟没碰这个页面她会睡着（zzz，动态小克会闭上眼），一碰就醒'
xkMarksChk.addEventListener('change', function () { xkSetMarksOn(xkMarksChk.checked) })
var xkRowMarks = menuRow()
xkRowMarks.appendChild(menuLabel('状态记号'))
xkRowMarks.appendChild(xkMarksChk)
menuBox.appendChild(xkRowMarks)`

export const WIDGET_PATCHES = [
  {
    why: '刷新页面时直接用上次选的内置动态小克（这里还量不到大小，先用默认大小够用的 256 档）',
    from: "if (initRoleId && initRoleId !== 'default') initRoleUrl = '/dsh-xiaoke/role-image.png?id=' + encodeURIComponent(initRoleId)",
    to: "if (initRoleId === 'anim' || initRoleId === 'anim-mood') initRoleUrl = '/dsh-xiaoke/anim.webp?r=256'\n" +
        "  else if (initRoleId && initRoleId !== 'default') initRoleUrl = '/dsh-xiaoke/role-image.png?id=' + encodeURIComponent(initRoleId)",
  },
  {
    why: '加入动态小克 / 换哭脸 / 状态记号的函数，并让 roleUrl 认识两个内置动态小克',
    from: "function roleUrl(id) {\n  if (id === 'default') return IMG_URL",
    to: MOOD_CODE + MARK_CODE + "function roleUrl(id) {\n  if (id === 'default') return IMG_URL\n  if (xkIsAnim(id)) return xkAnimUrl('anim')",
  },
  {
    why: '选中内置动态小克时，按挂件当前大小挑素材档位',
    from: "function applyRole(id, name, url) {\n  currentRole = { id: id, name: name, url: url }",
    to: "function applyRole(id, name, url) {\n  if (xkIsAnim(id)) url = xkAnimUrl('anim')\n  currentRole = { id: id, name: name, url: url }",
  },
  {
    why: '换角色后按当前余额重新决定要不要哭（睡着的话换成睡脸）',
    from: "  setupHitTest(url)\n  closeRolePanel()\n  renderRolePanel()\n}",
    to: "  setupHitTest(url)\n  closeRolePanel()\n  renderRolePanel()\n  xkReapplyMood()\n}",
  },
  {
    why: '每次拿到余额（和余额预警同一处）更新表情',
    from: "function checkUsageAlerts(balance, todayUsage) {\n  try {",
    to: "function checkUsageAlerts(balance, todayUsage) {\n  try { xkUpdateMood(balance) } catch (err) {}\n  try {",
  },
  {
    why: '内置动态小克不能删（角色列表）',
    from: "      if (r.id !== 'default') {\n        var del = document.createElement('button')",
    to: `      if (r.id !== 'default' && !${isAnim('r.id')}) {\n        var del = document.createElement('button')`,
  },
  {
    why: '内置动态小克在资源管理里算默认角色（只读）',
    from: "var isDefault = r.id === 'default'",
    to: `var isDefault = r.id === 'default' || ${isAnim('r.id')}`,
  },
  {
    why: '导入新角色后挑「最新的那个」时跳过内置角色',
    from: "if (roleList[i].id !== 'default' && (!newest || roleList[i].createdAt > newest.createdAt)) newest = roleList[i]",
    to: `if (roleList[i].id !== 'default' && !${isAnim('roleList[i].id')} && (!newest || roleList[i].createdAt > newest.createdAt)) newest = roleList[i]`,
    count: 2,
  },
  {
    why: '角色列表里给动态 WebP 也标上「动图」（原来只认 GIF / APNG）',
    from: "if (r.format === 'gif' || r.format === 'apng') {",
    to: "if (r.format === 'gif' || r.format === 'apng' || r.format === 'webp') {",
  },
  {
    why: '「动图」标签文字',
    from: "gifTag.textContent = r.format === 'apng' ? 'APNG' : 'GIF'",
    to: "gifTag.textContent = r.format === 'apng' ? 'APNG' : (r.format === 'webp' ? '动图' : 'GIF')",
  },
  {
    why: '资源管理最后加一区「动态小克 · 高清档」（下载 / 安装 / 卸载 512 高清包）',
    from: "      auEnt.body.appendChild(empty2)\n    }\n  } catch (err) {}\n}",
    to: "      auEnt.body.appendChild(empty2)\n    }\n    xkHdSection(wrap)\n  } catch (err) {}\n}",
  },
  {
    why: '状态记号的样式（跟在「挂件在左半边时镜像」那条后面）',
    from: "  '.dshxkv-root.dshxkv-left{transform:scaleX(-1)}',\n",
    to: "  '.dshxkv-root.dshxkv-left{transform:scaleX(-1)}',\n" + MARK_CSS.map(rule => "  '" + rule + "',\n").join(''),
  },
  {
    why: '菜单里加一行「状态记号」开关（在「隐藏菜单按钮」下面）',
    from: 'menuBox.appendChild(rowHide)',
    to: 'menuBox.appendChild(rowHide)' + MARK_MENU,
  },
  {
    why: '每秒轮询 wait.json 时顺便更新状态记号',
    from: "        if (!d || !d.ok) return\n        if (typeof d.sessionName === 'string') waitSessionName = d.sessionName",
    to: "        if (!d || !d.ok) return\n        try { xkMarkPoll(d) } catch (err) {}\n        if (typeof d.sessionName === 'string') waitSessionName = d.sessionName",
  },
]

const ANIM_ROUTES = `

    // —— 内置动态小克 / 哭脸 / 睡脸（skin/xiaoke-features.mjs）——
    // 256 / 384 两档随插件（assets/xiaoke-anim[-cry|-sleep]-{256,384}.webp）；512 档是可选的高清包，
    // 用户在「资源管理」里选下载好的 zip 安装到 DSH 数据目录的 xiaoke-anim-hd/，只装 SHA-256 核对得上的文件
    const XK_HD_DIR = path.join(DSH_HOME, 'xiaoke-anim-hd')
    const XK_HD_FILES = ${JSON.stringify(HD_FILES)}
    const xkHdInstalled = () => Object.keys(XK_HD_FILES).every((f) => fs.existsSync(path.join(XK_HD_DIR, f)))
    // 从选中的文件里取出 webp：.webp 直接用；.zip 只读不压缩（stored）的条目，官方高清包就是这样打的
    function xkHdEntries(name, buf) {
      if (/\\.webp$/i.test(name)) return [[path.basename(name), buf]]
      if (!/\\.zip$/i.test(name)) return []
      let eocd = -1
      for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
      }
      if (eocd < 0) throw new Error('不是 zip 文件')
      const out = []
      let p = buf.readUInt32LE(eocd + 16)
      for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 目录损坏')
        const method = buf.readUInt16LE(p + 10)
        const size = buf.readUInt32LE(p + 20)
        const nameLen = buf.readUInt16LE(p + 28)
        const local = buf.readUInt32LE(p + 42)
        const entry = buf.toString('utf8', p + 46, p + 46 + nameLen)
        p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
        if (method !== 0) continue
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
        out.push([entry.split('/').pop(), buf.subarray(start, start + size)])
      }
      return out
    }
    disposers.push(registerRoute({
      kind: 'exact',
      path: '/dsh-xiaoke/anim-hd.json',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST') {
            // 高清包 zip 约 18MB，base64 后约 24MB
            const input = JSON.parse(await readBodyMax(req, 40 * 1024 * 1024))
            if (input.action === 'remove') {
              for (const f of Object.keys(XK_HD_FILES)) fs.rmSync(path.join(XK_HD_DIR, f), { force: true })
            } else if (input.action === 'install') {
              let got = 0
              for (const item of Array.isArray(input.files) ? input.files : []) {
                const m = /^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/.exec(String((item && item.data) || ''))
                if (!m) continue
                for (const [name, bytes] of xkHdEntries(String(item.name || ''), Buffer.from(m[1], 'base64'))) {
                  if (XK_HD_FILES[name] !== createHash('sha256').update(bytes).digest('hex')) continue
                  fs.mkdirSync(XK_HD_DIR, { recursive: true })
                  const tmp = path.join(XK_HD_DIR, name + '.tmp')
                  fs.writeFileSync(tmp, bytes)
                  fs.renameSync(tmp, path.join(XK_HD_DIR, name))
                  got++
                }
              }
              if (!got) throw new Error('选中的文件里没有高清包的内容（请选下载的 xiaoke-anim-hd.zip）')
            }
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, installed: xkHdInstalled() }))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, installed: xkHdInstalled(), error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))
    // ?r=256 / ?r=384 取随插件的档位；其余是 512：装了高清包用高清包，没装（或高清包里没有，比如睡脸）退回 384
    for (const [route, base] of [
      ['/dsh-xiaoke/anim.webp', 'xiaoke-anim'],
      ['/dsh-xiaoke/anim-cry.webp', 'xiaoke-anim-cry'],
      ['/dsh-xiaoke/anim-sleep.webp', 'xiaoke-anim-sleep'],
    ]) {
      disposers.push(registerRoute({
        kind: 'exact',
        path: route,
        handler: (req, res) => {
          try {
            const q = new URL(req.url || '/', 'http://localhost').searchParams.get('r')
            const hd = path.join(XK_HD_DIR, base + '-512.webp')
            const file = q === '256' || q === '384' ? path.join(PACKAGE_ROOT, 'assets', base + '-' + q + '.webp')
              : fs.existsSync(hd) ? hd : path.join(PACKAGE_ROOT, 'assets', base + '-384.webp')
            const bytes = fs.readFileSync(file)
            res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=3600', 'Content-Length': String(bytes.length) })
            res.end(bytes)
          } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('xiaoke anim unavailable: ' + String((err && err.message) || err))
          }
        },
      }))
    }`

const BUILTIN_ROLES = `[r,
            { id: 'anim', name: '小克（动态）', url: '/dsh-xiaoke/anim.webp?r=256', pinned: false, pinnedAt: null, createdAt: null, format: 'webp' },
            { id: 'anim-mood', name: '小克（含余额预警）', url: '/dsh-xiaoke/anim.webp?r=256', pinned: false, pinnedAt: null, createdAt: null, format: 'webp' }]`

const ACTIVITY_CODE = `    // —— 小克的状态记号（skin/xiaoke-features.mjs）——
    // 挂件头上的「…」（有会话在跑）和冒汗（上一轮出错了）要知道各会话在干什么：
    // turn/start 到 turn/end 之间算在跑；turn/end 的 reason.kind 是 'error' 就记下出错的时间，
    // 那个会话开始下一轮、被关掉，或者过了 30 分钟就不算了。子智能体的会话不算（它们是主会话那一轮里的事）。
    // 结果放进 wait.json 的 activity 一起给前端（前端本来就每秒轮询它）。
    const xkRunning = new Map() // sessionId -> 这一轮开始的时间
    const xkErrors = new Map() // sessionId -> 出错的时间
    const XK_ERROR_TTL = 30 * 60 * 1000
    const XK_RUNNING_TTL = 6 * 60 * 60 * 1000 // 万一漏了 turn/end，最多当它跑 6 小时
    function xkNoteActivity(sid, event) {
      try {
        const type = event && event.type
        if (type === 'turn/start') {
          xkRunning.set(sid, Date.now())
          xkErrors.delete(sid)
        } else if (type === 'turn/end') {
          xkRunning.delete(sid)
          const reason = event.data && event.data.reason
          if (reason && reason.kind === 'error') xkErrors.set(sid, Date.now())
        }
      } catch (err) {}
    }
    // 出了任何问题（比如上游改了 subagentSessions 的名字）都只当没有活动，不能让 wait.json 本来的内容跟着坏
    function xkActivity() {
      let running = 0
      let errorAt = 0
      try {
        const now = Date.now()
        for (const [sid, at] of xkRunning) {
          if (now - at > XK_RUNNING_TTL) xkRunning.delete(sid)
          else if (!subagentSessions.has(sid)) running++
        }
        for (const [sid, at] of xkErrors) {
          if (now - at > XK_ERROR_TTL) xkErrors.delete(sid)
          else if (!subagentSessions.has(sid)) errorAt = Math.max(errorAt, at)
        }
      } catch (err) {}
      return { running, errorAt }
    }
`

export const HOST_PATCHES = [
  {
    why: '加三个动图路由（日常 / 哭脸 / 睡脸）和高清包的安装 / 卸载接口',
    from: "res.end('rua gif unavailable: ' + String((err && err.message) || err))\n        }\n      },\n    }))",
    to: "res.end('rua gif unavailable: ' + String((err && err.message) || err))\n        }\n      },\n    }))" + ANIM_ROUTES,
  },
  {
    why: '角色列表在默认小克后面加上「小克（动态）」「小克（含余额预警）」',
    from: "          format: r.format === 'gif' || r.format === 'apng' ? r.format : 'png',\n        })),",
    to: "          format: r.format === 'gif' || r.format === 'apng' ? r.format : 'png',\n        })).flatMap((r) => r.id === ROLE_DEFAULT_ID\n          ? " + BUILTIN_ROLES + "\n          : [r]),",
  },
  {
    why: '状态记号：记下各会话在不在跑、上一轮有没有出错',
    from: "    // 监听所有会话的追加事件；按会话 id 分桶，turn/end 时结算该会话本轮\n",
    to: ACTIVITY_CODE + "    // 监听所有会话的追加事件；按会话 id 分桶，turn/end 时结算该会话本轮\n",
  },
  {
    why: '状态记号：每个会话事件都过一遍',
    from: "      notePendingEvent(sid, event, session)\n    }))",
    to: "      notePendingEvent(sid, event, session)\n      xkNoteActivity(String(sid), event)\n    }))",
  },
  {
    why: '状态记号：会话关掉时一起清掉',
    from: "      if (session && session.id) turnAggs.delete(session.id)\n    }))",
    to: "      if (session && session.id) turnAggs.delete(session.id)\n" +
        "      if (session && session.id) { xkRunning.delete(String(session.id)); xkErrors.delete(String(session.id)) }\n    }))",
  },
  {
    why: '状态记号：wait.json 里带上 activity（有几个会话在跑、最近一次出错的时间）',
    from: "          sessionName: waitState.sessionName || '',\n        }))",
    to: "          sessionName: waitState.sessionName || '',\n          activity: xkActivity(), // 小克的状态记号（skin/xiaoke-features.mjs）\n        }))",
  },
  {
    why: '「状态记号」开关的默认值（开）',
    from: "        wait: { charClose: false },\n",
    to: "        wait: { charClose: false },\n        // 小克头上的状态记号（skin/xiaoke-features.mjs），默认开\n        marks: { on: true },\n",
  },
  {
    why: '「状态记号」开关读回来',
    from: "      if (s.wait && typeof s.wait === 'object') d.wait = Object.assign({}, d.wait, { charClose: !!s.wait.charClose })\n",
    to: "      if (s.wait && typeof s.wait === 'object') d.wait = Object.assign({}, d.wait, { charClose: !!s.wait.charClose })\n" +
        "      if (s.marks && typeof s.marks === 'object') d.marks = { on: s.marks.on !== false } // 状态记号（skin/xiaoke-features.mjs）\n",
  },
  {
    why: '「状态记号」开关存下来',
    from: "      if (p.wait && typeof p.wait === 'object') led.settings.wait = Object.assign({}, led.settings.wait || {}, p.wait)\n",
    to: "      if (p.wait && typeof p.wait === 'object') led.settings.wait = Object.assign({}, led.settings.wait || {}, p.wait)\n" +
        "      if (p.marks && typeof p.marks === 'object') led.settings.marks = { on: p.marks.on !== false } // 状态记号（skin/xiaoke-features.mjs）\n",
  },
]
