import './ConfirmDialog.css';

export function ConfirmDialog({ titulo, mensaje, onConfirmar, onCancelar }) {
  return (
    <div className="fondo-modal">
      <div className="caja-modal">
        <h3>{titulo}</h3>
        <p>{mensaje}</p>
        <div className="botones-modal">
          <button onClick={onCancelar}>Cancelar</button>
          <button className="boton-peligro" onClick={onConfirmar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
