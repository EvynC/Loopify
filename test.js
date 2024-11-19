const graph = {
    nodes: {
        A: {}, B: {}, C: {}, D: {}
    },
    edges: {
        A: [{ to: 'B', distance: 1 }, { to: 'C', distance: 3 }],
        B: [{ to: 'A', distance: 1 }, { to: 'C', distance: 1 }],
        C: [{ to: 'A', distance: 3 }, { to: 'B', distance: 1 }, { to: 'D', distance: 1 }],
        D: [{ to: 'C', distance: 1 }]
    }
};

const startNodeId = 'A';
const endNodeId = 'D';

const result = findShortestPath(startNodeId, endNodeId);
console.log(result); // The shortest path from 'A' to 'D'
