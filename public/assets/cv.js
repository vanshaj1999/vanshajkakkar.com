// Nothing is sent automatically: each request is read before the CV goes out.
export function initCvForm() {
  const form = document.getElementById('cv-form');
  if (!form) return;
  const note = document.getElementById('cv-note');
  const btn = document.getElementById('cv-send');

  form.addEventListener('submit', e => {
    e.preventDefault();
    btn.disabled = true;
    note.textContent = 'Sending…';
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = String(v).slice(0, 400); });

    fetch('/api/cv-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error('rejected');
        const done = document.createElement('p');
        done.className = 'cvdone';
        done.textContent = 'Thanks. Vanshaj will review this and send the CV across shortly.';
        form.replaceChildren(done);
      })
      .catch(() => {
        btn.disabled = false;
        note.textContent = 'That did not go through. Email ';
        const a = document.createElement('a');
        a.href = 'mailto:Vanshaj.kakkar@gmail.com'; a.textContent = 'Vanshaj.kakkar@gmail.com';
        note.append(a, ' instead and it will reach him.');
      });
  });
}
