const entregas = [
  {
    id: '1',
    latitude: -16.680882,
    longitude: -49.2532691,
  },
  {
    id: '2',
    latitude: -16.680882,
    longitude: -49.2532691,
  }
];

const agrupadas = {};
entregas.forEach(e => {
  const key = `${e.latitude.toFixed(5)}_${e.longitude.toFixed(5)}`;
  if (!agrupadas[key]) agrupadas[key] = [];
  agrupadas[key].push(e);
});

entregas.forEach((entrega) => {
  const key = `${entrega.latitude.toFixed(5)}_${entrega.longitude.toFixed(5)}`;
  const group = agrupadas[key] || [];
  const indexInGroup = group.findIndex(g => g.id === entrega.id);
  
  let lat = entrega.latitude;
  let lng = entrega.longitude;

  if (group.length > 1) {
    const angle = (indexInGroup / group.length) * Math.PI * 2;
    const radius = 0.00015; // ~15 metros
    lat += Math.sin(angle) * radius;
    lng += Math.cos(angle) * radius;
  }

  console.log(`Entrega ${entrega.id} -> Original: [${entrega.latitude}, ${entrega.longitude}], Nova: [${lat}, ${lng}]`);
});
