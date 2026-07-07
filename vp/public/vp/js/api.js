// Thin fetch wrapper around Frappe /api/method/* with CSRF + uniform errors.
export const ctx = window.VP_CONTEXT || {};

function extractError(data) {
  if (!data) return null;
  // _server_messages is a JSON array of JSON-encoded {message,...} strings.
  if (data._server_messages) {
    try {
      const arr = JSON.parse(data._server_messages);
      const msgs = arr.map((s) => {
        try { return JSON.parse(s).message; } catch (e) { return s; }
      });
      if (msgs.length) return msgs.join('\n');
    } catch (e) { /* fall through */ }
  }
  if (data.exception) return String(data.exception).replace(/^.*?:\s*/, '');
  if (data.message && typeof data.message === 'string') return data.message;
  return null;
}

export async function call(method, args = {}) {
  const res = await fetch(`/api/method/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Frappe-CSRF-Token': ctx.csrfToken || '',
    },
    body: JSON.stringify(args || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON body */ }
  if (!res.ok) {
    const err = new Error(extractError(data) || `Lỗi máy chủ (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data ? data.message : null;
}

// Upload a private file and (via fieldname) attach it to a doc field.
// Uses XHR for real upload progress. Resolves with the file doc {file_url,...}.
export function uploadFile({ file, doctype, docname, fieldname, onProgress }) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('is_private', '1');
    fd.append('folder', 'Home');
    if (doctype) fd.append('doctype', doctype);
    if (docname) fd.append('docname', docname);
    if (fieldname) fd.append('fieldname', fieldname);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/method/upload_file');
    xhr.setRequestHeader('X-Frappe-CSRF-Token', ctx.csrfToken || '');
    xhr.setRequestHeader('Accept', 'application/json');
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data ? data.message : null);
      } else {
        reject(new Error(extractError(data) || `Tải tệp thất bại (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải tệp'));
    xhr.send(fd);
  });
}

// File field values are already server-relative URLs (/private/files/...).
export function fileUrl(url) {
  return url || '';
}
