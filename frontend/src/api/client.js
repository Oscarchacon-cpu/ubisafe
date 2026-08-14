async function llamarApi(ruta, opciones = {}) {
  const respuesta = await fetch(`https://ubisafe-p5ka.onrender.com/api${ruta}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  const datos = await respuesta.json();
  return datos;
}

export function get(ruta) {
  return llamarApi(ruta);
}

export function post(ruta, cuerpo) {
  return llamarApi(ruta, { method: 'POST', body: JSON.stringify(cuerpo ?? {}) });
}