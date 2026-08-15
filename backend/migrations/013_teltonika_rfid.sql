-- Agregar campo IMEI a vehículos
ALTER TABLE ubisafe.vehiculos
ADD COLUMN IF NOT EXISTS imei VARCHAR(20) UNIQUE;

-- Agregar campo tarjeta RFID a choferes
ALTER TABLE ubisafe.choferes
ADD COLUMN IF NOT EXISTS tarjeta_rfid VARCHAR(50) UNIQUE;

-- Tabla de puntos GPS históricos
CREATE TABLE IF NOT EXISTS ubisafe.puntos_gps (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  latitud DECIMAL(10, 8),
  longitud DECIMAL(11, 8),
  velocidad DECIMAL(5, 2),
  timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (vehiculo_id) REFERENCES ubisafe.vehiculos(id),
  FOREIGN KEY (empresa_id) REFERENCES ubisafe.empresas(id)
);

-- Tabla de eventos de identificación (escaneo de tarjeta)
CREATE TABLE IF NOT EXISTS ubisafe.eventos_identificacion (
  id SERIAL PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL,
  chofer_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  tipo_evento VARCHAR(50), -- 'escaneo_tarjeta', 'inicio_viaje', 'fin_viaje'
  timestamp TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (vehiculo_id) REFERENCES ubisafe.vehiculos(id),
  FOREIGN KEY (chofer_id) REFERENCES ubisafe.choferes(id),
  FOREIGN KEY (empresa_id) REFERENCES ubisafe.empresas(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_puntos_gps_vehiculo ON ubisafe.puntos_gps(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_identificacion_vehiculo ON ubisafe.eventos_identificacion(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_identificacion_chofer ON ubisafe.eventos_identificacion(chofer_id);
CREATE INDEX IF NOT EXISTS idx_vehiculos_imei ON ubisafe.vehiculos(imei);
CREATE INDEX IF NOT EXISTS idx_choferes_rfid ON ubisafe.choferes(tarjeta_rfid);

-- Comentarios
COMMENT ON TABLE ubisafe.puntos_gps IS 'Historial de ubicaciones GPS de vehículos para tracking histórico';
COMMENT ON TABLE ubisafe.eventos_identificacion IS 'Registro de escaneos RFID de conductores para trazabilidad';
