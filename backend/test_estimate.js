fetch('http://localhost:3001/api/tools/calculate_estimate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        items: [{ category: "Virtual Machines", service: "Virtual Machines", name: "B1ls", configuration: { sku: "B1ls" } }]
    })
})
    .then(r => r.text())
    .then(t => console.log(t))
    .catch(console.error);
