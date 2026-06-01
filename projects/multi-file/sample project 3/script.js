/* Emoji Picker / Manager
   - searchable emoji grid (built-in list)
   - favorites (localStorage)
   - copy-to-clipboard (emoji char or image)
   - custom emoji upload (image or .txt with emoji)
   - export/import JSON pack
*/

(() => {
  const STORAGE_KEY = 'emoji_manager_v1';
  const builtIn = [
    // useful selection (expand as you like)
    { id: 'e_grin', char: '😀', name: 'grinning face' },
    { id: 'e_smile', char: '😄', name: 'smiling face with open mouth' },
    { id: 'e_laugh', char: '😆', name: 'laughing' },
    { id: 'e_wink', char: '😉', name: 'winking face' },
    { id: 'e_heart', char: '❤️', name: 'red heart' },
    { id: 'e_star', char: '⭐', name: 'star' },
    { id: 'e_fire', char: '🔥', name: 'fire' },
    { id: 'e_party', char: '🎉', name: 'party popper' },
    { id: 'e_thumbs', char: '👍', name: 'thumbs up' },
    { id: 'e_ok', char: '👌', name: 'OK hand' },
    { id: 'e_pray', char: '🙏', name: 'folded hands' },
    { id: 'e_clap', char: '👏', name: 'clapping hands' },
    { id: 'e_cry', char: '😢', name: 'crying face' },
    { id: 'e_angry', char: '😠', name: 'angry face' },
    { id: 'e_think', char: '🤔', name: 'thinking face' },
    { id: 'e_eyes', char: '👀', name: 'eyes' },
    { id: 'e_phone', char: '📱', name: 'mobile phone' },
    { id: 'e_computer', char: '💻', name: 'laptop' },
    { id: 'e_money', char: '💰', name: 'money bag' },
    { id: 'e_calendar', char: '📅', name: 'calendar' },
    { id: 'e_check', char: '✅', name: 'check mark' },
    { id: 'e_cross', char: '❌', name: 'cross mark' },
    { id: 'e_location', char: '📍', name: 'round pushpin' },
    { id: 'e_clock', char: '⏰', name: 'alarm clock' },
    { id: 'e_book', char: '📘', name: 'blue book' },
    { id: 'e_plane', char: '✈️', name: 'airplane' },
    { id: 'e_sun', char: '☀️', name: 'sun' },
    { id: 'e_moon', char: '🌙', name: 'crescent moon' },
    { id: 'e_music', char: '🎵', name: 'musical note' },
    { id: 'e_camera', char: '📷', name: 'camera' },
    { id: 'e_cookie', char: '🍪', name: 'cookie' },
    { id: 'e_coffee', char: '☕', name: 'hot beverage' },
    { id: 'e_bike', char: '🚲', name: 'bicycle' },
    { id: 'e_car', char: '🚗', name: 'car' },
    { id: 'e_dog', char: '🐶', name: 'dog face' },
    { id: 'e_cat', char: '🐱', name: 'cat face' }
  ];

  // DOM
  const searchEl = document.getElementById('search');
  const onlyFavEl = document.getElementById('onlyFav');
  const gridEl = document.getElementById('grid');
  const favListEl = document.getElementById('favList');
  const uploadForm = document.getElementById('uploadForm');
  const customFile = document.getElementById('customFile');
  const customName = document.getElementById('customName');
  const btnExport = document.getElementById('btnExport');
  const btnImport = document.getElementById('btnImport');
  const importFile = document.getElementById('importFile');
  const btnClearCustom = document.getElementById('btnClearCustom');
  const toastEl = document.getElementById('toast');

  // state (persisted)
  let state = {
    favorites: [],     // array of keys: 'char:😄' or 'custom:<id>'
    custom: []         // array of { id, type:'image'|'char', value: dataURL or char, name }
  };

  // init
  load();
  renderGrid();
  renderFavs();
  attach();

  // --- storage ---
  function save(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
  }
  function load(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
      else save();
    } catch(e){ console.warn('load failed', e); }
  }

  // --- render grid ---
  function makeKeyForBuiltIn(ch){ return `char:${ch}`; }
  function makeKeyForCustom(id){ return `custom:${id}`; }
  function isFavorited(key){ return state.favorites.includes(key); }

  function renderGrid(){
    const q = (searchEl.value || '').trim().toLowerCase();
    const showFavs = onlyFavEl.checked;
    gridEl.innerHTML = '';

    // collate display list: built-in then custom
    const items = [];
    builtIn.forEach(b => {
      const key = makeKeyForBuiltIn(b.char);
      const match = (!q) || b.char.includes(q) || b.name.toLowerCase().includes(q) || key.includes(q);
      if (match && (!showFavs || isFavorited(key))) items.push({ type: 'built', key, ...b });
    });
    state.custom.forEach(c => {
      const key = makeKeyForCustom(c.id);
      const match = (!q) || (c.name && c.name.toLowerCase().includes(q)) || (c.type === 'char' && c.value.includes(q)) || key.includes(q);
      if (match && (!showFavs || isFavorited(key))) items.push({ type: 'custom', key, ...c });
    });

    if (!items.length){
      gridEl.innerHTML = `<div class="muted" style="padding:12px">No emoji found.</div>`;
      return;
    }

    items.forEach(it => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.tabIndex = 0;

      const emojiWrap = document.createElement('div');
      emojiWrap.className = 'emoji';
      if (it.type === 'built' || it.type === 'custom' && it.type === 'char'){
        emojiWrap.textContent = it.char || it.value;
      } else if (it.type === 'custom' && it.type === undefined && it.value) {
        // fallback
      }

      if (it.type === 'custom' && it.type !== 'char' && it.value && it.value.startsWith('data:')) {
        const img = document.createElement('img');
        img.src = it.value;
        img.alt = it.name || 'custom';
        img.style.maxWidth = '56px';
        img.style.maxHeight = '56px';
        emojiWrap.innerHTML = '';
        emojiWrap.appendChild(img);
      }

      // name
      const nameDiv = document.createElement('div');
      nameDiv.className = 'ename';
      nameDiv.textContent = it.name || (it.char ? it.char : 'custom');

      // controls (favorite / copy)
      const meta = document.createElement('div');
      meta.className = 'meta';

      const star = document.createElement('button');
      star.className = 'iconbtn star';
      star.innerHTML = '★';
      if (isFavorited(it.key)) star.classList.add('active');
      star.title = isFavorited(it.key) ? 'Unfavorite' : 'Add to favorites';
      star.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleFavorite(it.key, it);
        star.classList.toggle('active');
        star.title = isFavorited(it.key) ? 'Unfavorite' : 'Add to favorites';
        renderFavs();
      });

      const copyBtn = document.createElement('button');
      copyBtn.className = 'iconbtn';
      copyBtn.innerHTML = 'Copy';
      copyBtn.title = 'Copy to clipboard';
      copyBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await copyEmojiToClipboard(it);
      });

      meta.appendChild(star);
      meta.appendChild(copyBtn);

      tile.appendChild(emojiWrap);
      tile.appendChild(nameDiv);
      tile.appendChild(meta);

      tile.addEventListener('click', async () => {
        await copyEmojiToClipboard(it);
      });

      tile.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') await copyEmojiToClipboard(it);
      });

      gridEl.appendChild(tile);
    });
  }

  // --- favorites UI ---
  function renderFavs(){
    favListEl.innerHTML = '';
    if (!state.favorites.length){
      favListEl.textContent = 'No favorites yet — click the ★ on any emoji to favorite it.';
      return;
    }
    const items = [];
    state.favorites.forEach(k => {
      if (k.startsWith('char:')) {
        const ch = k.slice(5);
        items.push({ display: ch, key: k, name: ch });
      } else if (k.startsWith('custom:')) {
        const id = k.slice(7);
        const c = state.custom.find(x => x.id === id);
        if (c) items.push({ display: c.type === 'char' ? c.value : c.value, key: k, name: c.name || 'custom' , custom: c});
      }
    });
    items.forEach(it => {
      const pill = document.createElement('div');
      pill.className = 'fav-pill';
      if (typeof it.display === 'string' && it.display.startsWith('data:')) {
        const img = document.createElement('img');
        img.src = it.display;
        img.style.width = '20px'; img.style.height='20px'; img.style.objectFit='cover';
        pill.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = (typeof it.display === 'string' ? it.display : it.name);
        span.style.fontSize = '16px';
        pill.appendChild(span);
      }
      const name = document.createElement('div');
      name.textContent = it.name || '';
      name.style.marginLeft = '8px';
      name.style.fontSize = '13px';
      name.style.color = 'var(--muted)';
      pill.appendChild(name);

      const del = document.createElement('button');
      del.className = 'iconbtn';
      del.textContent = '×';
      del.style.marginLeft = '8px';
      del.title = 'Remove from favorites';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removeFavorite(it.key);
        renderGrid();
        renderFavs();
      });

      pill.appendChild(del);
      pill.addEventListener('click', async () => {
        // if custom and image, copy image; else copy char
        if (it.custom) {
          await copyEmojiToClipboard({ type: 'custom', key: it.key, ...it.custom });
        } else {
          await copyEmojiToClipboard({ type: 'built', key: it.key, char: it.display, name: it.name });
        }
      });

      favListEl.appendChild(pill);
    });
  }

  // --- favorites actions ---
  function toggleFavorite(key, item){
    const i = state.favorites.indexOf(key);
    if (i >= 0) state.favorites.splice(i,1);
    else state.favorites.unshift(key);
    save();
  }
  function removeFavorite(key){
    const i = state.favorites.indexOf(key);
    if (i >= 0) state.favorites.splice(i,1);
    save();
  }

  // --- copy logic ---
  async function copyEmojiToClipboard(item){
    try {
      if (item.type === 'built' || (item.type === 'custom' && item.type === 'char')) {
        const ch = item.char || item.value;
        await navigator.clipboard.writeText(ch);
        showToast(`Copied ${ch} to clipboard`);
      } else if (item.type === 'custom') {
        // item.value expected to be dataURL
        const dataURL = item.value;
        if (!dataURL) {
          await navigator.clipboard.writeText(item.name || 'emoji');
          showToast('Copied name to clipboard (no image)');
          return;
        }
        // try to copy image blob to clipboard (modern browsers)
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            const res = await fetch(dataURL);
            const blob = await res.blob();
            await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
            showToast('Image copied to clipboard');
            return;
          } catch (err) {
            // fallback to copying dataURL as text
          }
        }
        // fallback: copy dataURL text
        await navigator.clipboard.writeText(dataURL);
        showToast('Copied image data URL to clipboard (fallback)');
      } else {
        // fallback general
        const text = item.char || item.value || item.name || '';
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
      }
    } catch (err) {
      console.error(err);
      // last-chance fallback: select textarea and execCommand
      const ta = document.createElement('textarea');
      ta.value = item.char || item.value || item.name || '';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('Copied (fallback)'); } catch(e){ showToast('Copy failed'); }
      ta.remove();
    }
  }

  // --- upload custom emoji ---
  uploadForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = customFile.files && customFile.files[0];
    const name = (customName.value || '').trim();
    if (!file) return showToast('Select a file (image or .txt with emoji char).');

    // handle text file (.txt) — read emoji char
    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      const txt = await file.text();
      const first = txt.trim().split('\n')[0].trim();
      if (first) {
        const item = { id: uid('c'), type: 'char', value: first, name: name || first };
        state.custom.unshift(item);
        save();
        customFile.value = ''; customName.value = '';
        renderGrid(); renderFavs();
        showToast('Added custom emoji (char)');
        return;
      } else return showToast('Text file empty');
    }

    // otherwise assume image — convert to dataURL
    const dataURL = await readFileAsDataURL(file);
    const item = { id: uid('c'), type: 'image', value: dataURL, name: name || file.name };
    state.custom.unshift(item);
    save();
    customFile.value = ''; customName.value = '';
    renderGrid(); renderFavs();
    showToast('Custom image added');
  });

  btnClearCustom.addEventListener('click', () => {
    if (!confirm('Remove ALL custom emoji?')) return;
    state.custom = [];
    // remove any favorites that reference custom
    state.favorites = state.favorites.filter(k => !k.startsWith('custom:'));
    save();
    renderGrid(); renderFavs();
    showToast('Cleared custom emoji');
  });

  // --- export / import ---
  btnExport.addEventListener('click', () => {
    const pack = { custom: state.custom, favorites: state.favorites, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `emoji-pack-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    showToast('Exported JSON pack');
  });

  btnImport.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        if (Array.isArray(json.custom)) {
          json.custom.forEach(c => {
            // ensure new id to avoid collisions
            c.id = uid('c');
            state.custom.unshift(c);
          });
        }
        if (Array.isArray(json.favorites)) {
          // merge favorites, keep uniqueness
          json.favorites.forEach(k => { if (!state.favorites.includes(k)) state.favorites.push(k); });
        }
        save();
        renderGrid(); renderFavs();
        showToast('Imported JSON pack');
      } catch (err) {
        showToast('Invalid JSON file');
      }
    };
    reader.readAsText(f);
    importFile.value = '';
  });

  // --- utilities ---
  function uid(prefix='id'){ return prefix + Math.random().toString(36).slice(2,9); }
  function readFileAsDataURL(file){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function showToast(msg, t=1800){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(window._emojiToast);
    window._emojiToast = setTimeout(()=> toastEl.classList.remove('show'), t);
  }

  // --- events ---
  function attach(){
    searchEl.addEventListener('input', debounce(renderGrid, 120));
    onlyFavEl.addEventListener('change', renderGrid);

    // keyboard: arrow navigate grid tiles and Enter to copy
    document.addEventListener('keydown', (e) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); searchEl.focus();
      }
    });
  }

  function debounce(fn, time){
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), time); };
  }

})();
