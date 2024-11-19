const graph = {
    nodes: {
        A: {}, B: {}, C: {}, D: {}
    },
    edges: {
        A: [{ to: 'B', distance: 1 }, { to: 'C', distance: 3 }],
        B: [{ to: 'A', distance: 1 }, { to: 'C', distance: 1 }],
        C: [{ to: 'A', distllklkllololloololoolooance: 3 }, { to: 'B', distance: 1 }, { to: 'D', distance: 1 }],
        D: [{ to: 'C', distance: 1 }]
    }
};

const startNodeId = 'A';
const endNodeId = 'D';

const result = findShortestPath(startNodeId, endNodeId);
console.log(result); // The shortest path from 'A' to 'D'


function createRoute(startPoint, endPoint) {
    if (!graph || !graph.nodes || !graph.edges) {
        console.error('Graph data is not available. Please fetch data first.');
        return;
    }

    const startNode = findNearestNode(startPoint);
    const endNode = findNearestNode(endPoint);

    // Error Handeling 
    if (!startNode || !endNode) {
        console.error('Unable to find suitable start or end nodes');
        return;
    }

    const path = findShortestPath(startNode, endNode);

    if (!path) {
        console.error('No path found between the given points');
        return;
    }

    const routeCoordinates = path.map(nodeId => {
        const node = graph.nodes[nodeId];
        return [node.lat, node.lon];
    });

    console.log("Route created with the following coordinates:");
    console.log(routeCoordinates);

    // If Route Layer 
    // if (routeLayer) {
    //     map.removeLayer(routeLayer);
    // }
    // routeLayer = L.polyline(routeCoordinates, { color: 'red', weight: 5 }).addTo(map);

    return routeCoordinates;
}

function findNearestNode(point) {
    let nearestNode = null;
    let minDistance = Infinity;

    for (const nodeId in graph.nodes) {
        const node = graph.nodes[nodeId];
        const distance = haversineDistance(point[0], point[1], node.lat, node.lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearestNode = nodeId;
        }
    }

    return nearestNode;
}

function findShortestPath(startNodeId, endNodeId) {
    const distances = {};
    const previous = {};
    const unvisited = new Set(Object.keys(graph.nodes));

    for (const nodeId in graph.nodes) { // Finding Minimum Distance
        distances[nodeId] = Infinity;
    }
    distances[startNodeId] = 0;

    while (unvisited.size > 0) {
        // converts the unvisted set into an array to use the .reduce function which finds the smallest distance value 
        const current = Array.from(unvisited).reduce((minNode, node) =>
            distances[node] < distances[minNode] ? node : minNode
        );

        if (current === endNodeId) break;

        unvisited.delete(current);

        if (!graph.edges[current]) continue;

        for (const edge of graph.edges[current]) {
            const neighbor = edge.to;
            const alt = distances[current] + edge.distance;
            if (alt < distances[neighbor]) {
                distances[neighbor] = alt;
                previous[neighbor] = current;
            }
        }
    }

    if (distances[endNodeId] === Infinity) {
        return null; // No path found
    }

    // Reconstruct the path
    const path = [];
    let current = endNodeId;
    while (current !== startNodeId) {
        path.unshift(current);
        current = previous[current];
    }
    path.unshift(startNodeId);

    return path;
}

// Test the createRoute function
const startPoint = [51.5074, -0.1278]; // Example start point
const endPoint = [51.5007, -0.1246]; // Example end point

const route = createRoute(startPoint, endPoint);

// If you want to visualize the route on the map, you can add this line:
// map.fitBounds(routeLayer.getBounds());