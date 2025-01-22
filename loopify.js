// Instance Variables
let map, userLocationCircle;
let currentUnit = 'mi';
let kmConstant = 1.60934;
let waypoints = [];
let targetDistance = 0;
let currentDistance = 0;
let currentElevation = 0;
let quotes = [];
let OPENROUTE_API_KEY = "";
let markers = [];
let autocompleteTimeout;
let isSearching = false;
let originalPosition;
let undoStack = [];
let redoStack = [];
let snappedLatLng = [];
let previousDistance = 0.25 * kmConstant;
let bathroomLayer, trafficLightLayer;
let showTrafficLight = true, showBathroom = true;
let loaded = false;
let satelliteLayer, osmLayer;
let isBathroomLoading = false;
let isTrafficLightLoading = false;
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000

let isLayerToggling = false;
let isBathroomToggling = false;
let isTrafficLightToggling = false;


// Maps 
let bathroomMarkers = new Map();
let trafficLightMarkers = new Map();

function initMap() {
    

    map = L.map('map', {
        attributionControl: false
    }).setView([0, 0], 13,);
    
    var attributionControl = L.control.attribution({
        position: 'bottomright',
        prefix: ''
    }).addTo(map);

    attributionControl.addAttribution('&copy; <a href="#" id="creditsLink">Loopify Credits</a>');
    

    // osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    //     attribution: '© OpenStreetMap contributors'
    // }).addTo(map);

    osmLayer = L.tileLayer('http://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    osmLayer.addTo(map)

    satelliteLayer = L.tileLayer('http://{s}.google.com/vt?lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    map.whenReady(() => {
        console.log('Map is fully initialized and ready for interactions.');
    });

    bathroomLayer = L.layerGroup().addTo(map);
    trafficLightLayer = L.layerGroup().addTo(map);

    promptForLocation();



    map.on('zoomend', updateUserLocationCircleSize);
    map.on('click', onMapClick);
    map.on('zoomend', () => updateObject('All'));
    map.on('moveend', () => updateObject('All'));
}



function promptForLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const {
                    latitude,
                    longitude
                } = position.coords;
                originalPosition = [latitude, longitude];
                map.setView(originalPosition, 16);
                addUserLocationCircle(originalPosition);
                startingNode = {
                    lat: latitude,
                    lon: longitude
                };
                fetchData();
            },
            (error) => {
                console.error('Error getting location:', error);
                alert("Unable to get your location. Using default location.");
                originalPosition = [51.505, -0.09];
                map.setView(originalPosition, 16);
                addUserLocationCircle(originalPosition);
                startingNode = {
                    lat: 51.505,
                    lon: -0.09
                };
                fetchData();
            }
        );
    } else {
        alert("Geolocation is not supported by your browser. Using default location.");
        originalPosition = [51.505, -0.09];
        map.setView(originalPosition, 18);
        addUserLocationCircle(originalPosition);
        startingNode = {
            lat: 51.505,
            lon: -0.09
        };
        fetchData();
    }
}

function addUserLocationCircle(latlng) {
    if (userLocationCircle) {
        map.removeLayer(userLocationCircle);
    }

    const zoom = map.getZoom();
    const radius = Math.max(2, zoom - 7);

    userLocationCircle = L.circleMarker(latlng, {
        color: 'white',
        fillColor: '#0031d1',
        fillOpacity: 0.8,
        radius: radius
    }).addTo(map);
}

function updateUserLocationCircleSize() {
    if (userLocationCircle) {
        const zoom = map.getZoom();
        const radius = Math.max(2, zoom - 7);
        userLocationCircle.setRadius(radius);
    }
}

async function requestAPI() {
    try {
        const response = await fetch('.gitignore/config.json');
        OPENROUTE_API_KEY = await response.json();
    } catch (error) {
        console.error('Error fetching quotes:', error);
    }
}

function onMapClick(e) {
    if (!isSearching && loaded) {

        const [snappedLat, snappedLon] = snapToNearestEdge(e.latlng.lat, e.latlng.lng);
        startingNode = {
            lat: snappedLat,
            lon: snappedLon
        };
        addWaypoint(L.latLng(snappedLat, snappedLon));
    }
}

function addWaypoint(latlng) {
    const [snappedLat, snappedLon] = snapToNearestEdge(latlng.lat, latlng.lng);
    snappedLatLng = L.latLng(snappedLat, snappedLon);

    undoStack.push([...waypoints]);
    redoStack = [];

    const newMarker = L.circleMarker(snappedLatLng, {
        color: 'black',
        fillColor: waypoints.length === 0 ? 'green' : 'red',
        fillOpacity: 0.9,
        radius: 10
    }).addTo(map);

    markers.push(newMarker);
    waypoints.push(snappedLatLng);

    if (markers.length > 1) {
        const previousMarker = markers[markers.length - 2];
        if (previousMarker != markers[0]) {
            previousMarker.setStyle({
                color: 'black',
                fillColor: 'blue',
                radius: 8
            });
        }

        // Draw a line between the last two waypoints


        // LETS DO THIS LATER
        createPath([waypoints[waypoints.length - 2], snappedLatLng])

        // L.polyline([waypoints[waypoints.length - 2], snappedLatLng], { color: 'red' }).addTo(map);
    }

    updateDistanceAndElevation();
}

function updateDistanceAndElevation() {
    currentDistance = calculateTotalDistance();
    currentElevation = calculateMockElevation(currentDistance);
    updateDistanceDisplay();
    updateElevationDisplay();
}

function calculateTotalDistance() {
    let totalDistance = 0;
    for (let i = 1; i < waypoints.length; i++) {
        totalDistance += waypoints[i - 1].distanceTo(waypoints[i]);
    }
    return totalDistance;
}

function updateDistanceDisplay() {
    const actualDistanceElement = document.getElementById('actualDistance');
    let displayDistance;
    if (currentUnit === 'km') {
        displayDistance = currentDistance / 1000;
        actualDistanceElement.textContent = `Distance: ${displayDistance.toFixed(2)} km`;
    } else {
        displayDistance = currentDistance / 1609.34;
        actualDistanceElement.textContent = `Distance: ${displayDistance.toFixed(2)} mi`;
    }
}

function updateElevationDisplay() {
    const elevationElement = document.getElementById('elevation');
    if (currentUnit === 'km') {
        elevationElement.textContent = `Elevation: ${currentElevation.toFixed(0)} m`;
    } else {
        const elevationFt = currentElevation * 3.28084;
        elevationElement.textContent = `Elevation: ${elevationFt.toFixed(0)} ft`;
    }
}

function calculateMockElevation(distance) { // NEED TO APPLY AN API FOR THIS
    return Math.floor(distance / 100);
}

function toggleUnit(unit) {
    currentUnit = unit;
    document.querySelectorAll('.unit-option').forEach(option => {
        option.classList.toggle('active', option.dataset.unit === unit);
    });
    const slider = document.querySelector('.unit-slider');
    slider.style.transform = unit === 'km' ? 'translateX(calc(100% + 13px))' : 'translateX(0)';
    updateDistanceDisplay();
    updateElevationDisplay();
}

function toggleFullscreen() {
    const mapElement = document.getElementById('map');
    if (!document.fullscreenElement) {
        if (mapElement.requestFullscreen) {
            mapElement.requestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function relocateToOriginalPosition() {
    if (originalPosition) {
        map.setView(originalPosition, 18);
        addUserLocationCircle(originalPosition);
    }
}

async function fetchQuotes() {
    try {
        const response = await fetch('./quotes/RunningQuote.json');
        quotes = await response.json();
        displayRandomQuote();
    } catch (error) {
        console.error('Error fetching quotes:', error);
    }
}

function displayRandomQuote() {
    if (quotes.length === 0) return;

    const randomIndex = Math.floor(Math.random() * quotes.length);
    const randomQuote = quotes[randomIndex];

    document.getElementById('quote').textContent = `"${randomQuote.quote}"`;
    document.getElementById('author').textContent = `- ${randomQuote.author}`;
}

function getQuote(index) {
    if (quotes.length === 0) return;

    const quote = quotes[index];

    document.getElementById('quote').textContent = `"${quote.quote}"`;
    document.getElementById('author').textContent = `- ${quote.author}`;
}

function clearRoute() {
    undoStack.push([...waypoints]);
    redoStack = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    waypoints = [];
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });
    if (nodesLayer) map.removeLayer(nodesLayer);
    currentDistance = 0;
    currentElevation = 0;
    updateDistanceDisplay();
    updateElevationDisplay();
}

function searchLocation() {
    const query = document.getElementById('searchInput').value;
    if (query.length < 3) return;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            const autocompleteResults = document.getElementById('autocompleteResults');
            autocompleteResults.innerHTML = '';

            if (data.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = 'No location found';
                autocompleteResults.appendChild(noResults);
            } else {
                data.slice(0, 5).forEach(result => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.textContent = result.display_name;
                    item.addEventListener('click', () => selectLocation(result));
                    autocompleteResults.appendChild(item);
                });
            }
            autocompleteResults.style.display = 'block';
        })
        .catch(error => {
            console.error('Error:', error);
            const autocompleteResults = document.getElementById('autocompleteResults');
            autocompleteResults.innerHTML = '';
            const errorMessage = document.createElement('div');
            errorMessage.className = 'no-results';
            errorMessage.textContent = 'Error searching for location';
            autocompleteResults.appendChild(errorMessage);
            autocompleteResults.style.display = 'block';
        });
}

function selectLocation(location) {
    const latlng = L.latLng(parseFloat(location.lat), parseFloat(location.lon));
    map.setView(latlng, 18);
    addWaypoint(latlng);
    document.getElementById('autocompleteResults').style.display = 'none';
    document.getElementById('searchInput').value = location.display_name;
    isSearching = false;
}

function undo() {
    if (undoStack.length > 0) {
        redoStack.push([...waypoints]);
        waypoints = undoStack.pop();
        updateRouteAndMarkers();
    }
}

function redo() {
    if (redoStack.length > 0) {
        undoStack.push([...waypoints]);
        waypoints = redoStack.pop();
        updateRouteAndMarkers();
    }
}

function updateRouteAndMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });

    waypoints.forEach((latlng, index) => {
        let color = 'black', fillColor;
        if (index === 0) {
            fillColor = 'green';
        } else if (index === waypoints.length - 1) {
            fillColor = 'red';
        } else {
            fillColor = 'white';
        }

        let radius;

        if (index === 0 || index === waypoints.length - 1)
            radius = 10;
        else
            radius = 8;

        const newMarker = L.circleMarker(latlng, {
            color: color,
            fillColor: fillColor,
            fillOpacity: 0.8,
            radius: radius
        }).addTo(map);
        markers.push(newMarker);

        // if (index > 0) {
        //     L.polyline([waypoints[index - 1], latlng], {
        //         color: '#z  ',
        //         weight: 4
        //     }).addTo(map);
        // }
    });
    updateDistanceAndElevation();
}

function snapToNearestEdge(lat, lon) {
    let nearestEdge = null;
    let minDistance = Infinity;
    let nearestPoint = [lat, lon];

    Object.values(graph.edges).forEach(edgeList => {
        edgeList.forEach(edge => {
            const fromNode = graph.nodes[edge.from];
            const toNode = graph.nodes[edge.to];

            if (fromNode && toNode) {
                const edgePoint = findNearestPointOnSegment(
                    lat, lon,
                    fromNode.lat, fromNode.lon,
                    toNode.lat, toNode.lon
                );

                const distance = haversineDistance(lat, lon, edgePoint[0], edgePoint[1]);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestEdge = edge;
                    nearestPoint = edgePoint;
                }
            }
        });
    });
    return nearestPoint;
}

function findNearestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        return [x1, y1];
    }
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    // Edge cases
    if (t < 0) {
        return [x1, y1];
    }
    if (t > 1) {
        return [x2, y2];
    }

    return [x1 + t * dx, y1 + t * dy];
}

const EARTH_RADIUS = 6371; // km

function haversineDistance(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c;
}

function getBoundingBox(lat, lon, distance) {
    if (currentUnit === 'mi') {
        distance *= kmConstant; // Convert miles to kilometers
    }

    const EARTH_RADIUS = 6371; // Earth's radius in kilometers
    const latChange = (distance / EARTH_RADIUS) * (180 / Math.PI);
    const lonChange = (distance / (EARTH_RADIUS * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);

    const boundingBox = [
        [lat - latChange, lon - lonChange], // Bottom-left (south-west)
        [lat + latChange, lon + lonChange] // Top-right (north-east)
    ];

    const topLeft = [lat + latChange, lon - lonChange];
    const topRight = [lat + latChange, lon + lonChange];

    // Call the haversineDistance function to calculate distance between top-left and top-right
    const distanceTopLeftToTopRight = haversineDistance(topLeft[0], topLeft[1], topRight[0], topRight[1]);

    console.log("Distance between Top-Left and Top-Right: ", distanceTopLeftToTopRight.toFixed(2), "km");

    return boundingBox;
}


// This is the filters dropdown code 
function toggleDropdown() {
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.classList.toggle('show');
}

async function loadBathrooms() {
    isBathroomLoading = true;
    const bounds = map.getBounds();
    const cacheKey = `bathrooms_${bounds.getSouth()}_${bounds.getWest()}_${bounds.getNorth()}_${bounds.getEast()}`
    const cachedData = localStorage.getItem(cacheKey)

    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData)
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
            console.log("Using cached bathroom data")
            bathrooms = data
        }
    } else bathrooms = await fetchAndFilterObjects(
        `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="toilets"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
        './assets/Bathroom.png'
    );

    updateMarkers(bathrooms, bathroomMarkers, bathroomLayer, 'Bathroom');
    isBathroomLoading = false;
}

async function loadTrafficLights() {
    isTrafficLightLoading = true;
    const bounds = map.getBounds();
    const cacheKey = `lights_${bounds.getSouth()}_${bounds.getWest()}_${bounds.getNorth()}_${bounds.getEast()}`
    const cachedData = localStorage.getItem(cacheKey)

    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData)
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
            console.log("Using cached bathroom data")
            lights = data
        }
    } else lights = await fetchAndFilterObjects(
        `https://overpass-api.de/api/interpreter?data=[out:json];node["highway"="traffic_signals"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
        './assets/TrafficLight.png'
    );
    updateMarkers(lights, trafficLightMarkers, trafficLightLayer, 'TrafficLight');
    isTrafficLightLoading = false;
}

async function fetchAndFilterObjects(url, iconPath) {
    const response = await fetch(url);
    const data = await response.json();
    return filterObjects(data.elements, iconPath);
}

function filterObjects(objects, iconPath) {
    const thresholdDistance = 100; // meters
    const filteredObjects = [];
    objects.forEach(object => {
        if (!filteredObjects.some(filteredObject =>
            haversineDistance(filteredObject.lat, filteredObject.lon, object.lat, object.lon) *
            1000 < thresholdDistance
        )) {
            filteredObjects.push(object);
        }
    });
    return filteredObjects;
}

async function fetchRoadData(bbox) {
    const query = `
[out:json];
(
way["highway"](${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]});
node(w);
);
out body;
>;
out skel qt;
`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    const graph = {
        nodes: {},
        edges: {}
    };

    // Process all nodes
    data.elements.forEach(element => {
        if (element.type === 'node') {
            graph.nodes[element.id] = {
                id: element.id,
                lat: element.lat,
                lon: element.lon
            };
        }
    });

    // Process all ways
    data.elements.forEach(element => {
        if (element.type === 'way' && element.tags && element.tags.highway) {
            for (let i = 1; i < element.nodes.length; i++) {
                const fromId = element.nodes[i - 1];
                const toId = element.nodes[i];
                if (graph.nodes[fromId] && graph.nodes[toId]) {
                    const fromNode = graph.nodes[fromId];
                    const toNode = graph.nodes[toId];
                    const distance = haversineDistance(fromNode.lat, fromNode.lon, toNode
                        .lat,
                        toNode.lon);
                    if (!graph.edges[fromId]) graph.edges[fromId] = [];
                    if (!graph.edges[toId]) graph.edges[toId] = [];
                    graph.edges[fromId].push({
                        from: fromId,
                        to: toId,
                        distance,
                        name: element.tags.name || '',
                        highway: element.tags.highway
                    });
                    graph.edges[toId].push({
                        from: toId,
                        to: fromId,
                        distance,
                        name: element.tags.name || '',
                        highway: element.tags.highway
                    });
                }
            }
        }
    });
    return graph;
}

function visualizeData() {
    if (!graph) {
        console.error('No graph data available. Please fetch data first.');
        return;
    }
    if (boundingBoxLayer) map.removeLayer(boundingBoxLayer);
    if (nodesLayer) map.removeLayer(nodesLayer);
    if (edgesLayer) map.removeLayer(edgesLayer);
    const distance = parseFloat(document.getElementById('distanceInput').value);
    let center;
    if (startingNode) {
        center = L.latLng(startingNode.lat, startingNode.lon);
    } else if (userLocationCircle) {
        center = userLocationCircle.getLatLng();
    } else {
        center = map.getCenter();
    }
    const bbox = getBoundingBox(center.lat, center.lng, distance);
    boundingBoxLayer = L.rectangle(bbox, {
        color: 'blue',
        weight: 2,
        fillOpacity: 0.1
    }).addTo(map);

    nodesLayer = L.layerGroup().addTo(map);

    Object.values(graph.nodes).forEach(node => {
        L.circleMarker([node.lat, node.lon], {
            radius: 3,
            color: 'green',
            fillOpacity: 1
        }).addTo(nodesLayer);
    });

    edgesLayer = L.layerGroup().addTo(map);
    Object.values(graph.edges).forEach(edgeList => {
        edgeList.forEach(edge => {
            const fromNode = graph.nodes[edge.from];
            const toNode = graph.nodes[edge.to];
            L.polyline([
                [fromNode.lat, fromNode.lon],
                [toNode.lat, toNode.lon]
            ], {
                color: 'purple',
                weight: 2,
                opacity: 0.7
            }).addTo(edgesLayer);
        });
    });

    console.log(`Visualized ${Object.keys(graph.nodes).length} nodes and
${Object.values(graph.edges).reduce((sum, edges) => sum + edges.length, 0)} edges`);
}

let routeLayer, boundingBoxLayer, userMarker, nodesLayer, edgesLayer;
let graph = null;
let startingNode = null;

async function fetchData() {
    const distance = parseFloat(document.getElementById('distanceInput').value);
    let center;

    if (startingNode) {
        center = L.latLng(startingNode.lat, startingNode.lon);
    } else if (userLocationCircle) {
        center = userLocationCircle.getLatLng();
    } else {
        center = map.getCenter();
    }

    const bbox = getBoundingBox(center.lat, center.lng, distance);
    const cacheKey = `roadData_${bbox.join('_')}`;

    // Check if data is in cache
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        graph = JSON.parse(cachedData);
        console.log('Using cached data');
        loaded = true;
        return;
    }

    var d = new Date();
    try {
        graph = await fetchRoadData(bbox);

        if (Object.keys(graph.nodes).length === 0) {
            throw new Error(
                'No road data found in the selected area. Try moving the map or increasing the distance.'
            );
        }

        // Cache the fetched data
        localStorage.setItem(cacheKey, JSON.stringify(graph));

        console.log(
            `Fetched ${Object.keys(graph.nodes).length} nodes and ${Object.keys(graph.edges).length} edges`
        );
        var time = (d.getMinutes() * 60) + d.getSeconds() + (d.getMilliseconds() / 1000);
        var d = new Date();
        var totalTime = (((d.getMinutes() * 60) + d.getSeconds() + (d.getMilliseconds() / 1000)) -
            time)
        totalTime = Number(totalTime.toFixed(5))
        console.log("Loaded in ", totalTime, " Seconds. ")
        loaded = true;
    } catch (error) {
        console.error('Error fetching road data:', error);
    }
}

function createRoute(waypoints) {
    console.log("Waypoint 1: " + waypoints[0].toString())
    console.log("-------------------------------")
    console.log("Waypoint 2: " + waypoints[1].toString())

    const url = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${OPENROUTE_API_KEY}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`;

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            const route = data.features[0].geometry.coordinates;
            drawRoute(route);
            updateDistance(data.features[0].properties.summary.distance);
        })
        .catch(error => {
            console.error('Error fetching route:', error);
        });

}

async function getRoute(start, end) {
    try {
        const response = await axios.get(`https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${OPENROUTE_API_KEY}&start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`);
        const route = response.data.features[0].geometry.coordinates;
        drawRoute(route);
        updateDistance(response.data.features[0].properties.summary.distance);
    } catch (error) {
        console.error('Error fetching route:', error);
    }
}


function createPath(waypoints) {
    console.log("Waypoint 1: " + waypoints[0].toString())
    console.log("-------------------------------")
    console.log("Waypoint 2: " + waypoints[1].toString())

    // Error Handeling
    if (!graph || !graph.nodes || !graph.edges) {
        console.error('Graph data is not available. Please fetch data first.');
        return;
    }

    const startNode = findNearestNode(waypoint[0]);
    const endNode = findNearestNode(waypoint[1]);

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

    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
    routeLayer = L.polyline(routeCoordinates, { color: 'red', weight: 3 }).addTo(map);

    return routeCoordinates;
}

function findNearestNode(point, graph) {
    let nearestNode = null;
    let minDistance = Infinity;

    for (const nodeId in graph.nodes) {
        const node = graph.nodes[nodeId];
        const distance = haversineDistance(point.lat, point.lng, node.lat, node.lon);
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

    // Initialize distances
    for (const nodeId in graph.nodes) {
        distances[nodeId] = nodeId === startNodeId ? 0 : Infinity;
    }

    while (unvisited.size > 0) {
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

//Example usage (assuming graph, map, routeLayer, and haversineDistance are defined elsewhere)
//let waypoints = [{lat:34.0522, lng:-118.2437}, {lat:37.7749, lng:-122.4194}]
//createPath(waypoints);


// Keeps track of filters
function initFilters() {

    bathroomLayer = L.layerGroup().addTo(map);
    trafficLightLayer = L.layerGroup().addTo(map);

    document.getElementById('showBathrooms').checked = true;
    document.getElementById('showTrafficLights').checked = true;

    updateObject();
}

function toggleSatelliteView() {
    const satelliteCheckbox = document.getElementById('satelliteView');
    const isChecked = satelliteCheckbox.checked;

    if (!osmLayer || !satelliteLayer) {
        console.error('Layers are not initialized yet.');
        return;
    }

    if (isLayerToggling) return; // Prevent toggle during operation
    isLayerToggling = true;

    // Display loading indicator
    satelliteCheckbox.disabled = true;

    if (isChecked) {
        if (map.hasLayer(osmLayer)) {
            map.removeLayer(osmLayer);
        }
        map.addLayer(satelliteLayer);
    } else {
        if (map.hasLayer(satelliteLayer)) {
            map.removeLayer(satelliteLayer);
        }
        map.addLayer(osmLayer);
    }

    setTimeout(() => {
        isLayerToggling = false;
        satelliteCheckbox.disabled = false; // Re-enable checkbox
    }, 300); // Allow time for layers to settle
}
// WORK ON BATHROOM AND TAFFIC LIGHTS

function toggleBathrooms() {
    if (isBathroomToggling || isTrafficLightToggling) return; // Prevent toggling during ongoing operation
    isBathroomToggling = true;

    const showBathroomsCheckbox = document.getElementById('showBathrooms');
    const isChecked = showBathroomsCheckbox.checked;

    if (isChecked) {
        if (isBathroomLoading) {
            console.log("Bathrooms are still loading...");
        } else if (bathroomMarkers.size === 0) {
            loadBathrooms();
        }
        if (!map.hasLayer(bathroomLayer)) {
            map.addLayer(bathroomLayer);
        }
    } else {
        if (map.hasLayer(bathroomLayer)) {
            map.removeLayer(bathroomLayer);
        }
        bathroomLayer.clearLayers();
        bathroomMarkers.clear();
    }

    // Reset the toggle state after operation
    setTimeout(() => {
        isBathroomToggling = false;
    }, 300); // Adjust the debounce time as needed
}

function toggleTrafficLights() {
    if (isTrafficLightToggling || isBathroomToggling) return; // Prevent toggling during ongoing operation
    isTrafficLightToggling = true;

    const showTrafficLightsCheckbox = document.getElementById('showTrafficLights');
    const isChecked = showTrafficLightsCheckbox.checked;



    if (isChecked) {
        if (isTrafficLightLoading) {
            console.log("Traffic Lights are still loading...");
        } else if (trafficLightMarkers.size === 0) {
            loadTrafficLights();
        }
        if (!map.hasLayer(trafficLightLayer)) {
            map.addLayer(trafficLightLayer);
        }
    } else {
        if (map.hasLayer(trafficLightLayer)) {
            map.removeLayer(trafficLightLayer);
        }
        trafficLightLayer.clearLayers();
        trafficLightMarkers.clear();
    }

    // Reset the toggle state after operation
    setTimeout(() => {
        isTrafficLightToggling = false;
    }, 300); // Adjust the debounce time as needed
}

async function updateObject(object) {
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // If it doesn't exist don't do anything
    if (!map || !bathroomLayer || !trafficLightLayer) return;

    // If the zoom is too big just remove everything
    console.log("Zoom:" + zoom)
    console.log("UPDATED OBJECTS")


    // BATHROOMS
    if (object === "Bathroom" || object === "All") {
        if (document.getElementById('showBathrooms').checked) {
            if (!isBathroomLoading && bathroomMarkers.size === 0) {
                await loadBathrooms();
            }
        } else {
            bathroomLayer.clearLayers();
            bathroomMarkers.clear();
        }
    }

    // TRAFFIC LIGHTS
    if (object === "TrafficLight" || object === "All") {
        if (document.getElementById('showTrafficLights').checked) {
            const lights = await fetchAndFilterObjects(
                `https://overpass-api.de/api/interpreter?data=[out:json];node["highway"="traffic_signals"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
                './assets/TrafficLight.png'
            );
            updateMarkers(lights, trafficLightMarkers, trafficLightLayer, 'TrafficLight');
        } else {
            trafficLightLayer.clearLayers();
            trafficLightMarkers.clear();
        }
    }
}

function updateMarkers(objects, markerMap, layer, type) {
    const bounds = map.getBounds();
    const iconUrl = type === 'Bathroom' ? './assets/Bathroom.png' : './assets/TrafficLight.png';

    // Remove markers that are no longer in view
    markerMap.forEach((marker, id) => {
        if (!bounds.contains(marker.getLatLng())) {
            layer.removeLayer(marker);
            markerMap.delete(id);
        }
    });

    // Add new markers
    objects.forEach(obj => {
        const id = `${obj.lat},${obj.lon}`;
        if (!markerMap.has(id)) {
            const marker = L.marker([obj.lat, obj.lon], {
                icon: L.icon({
                    iconUrl: iconUrl,
                    iconSize: [25, 25],
                    iconAnchor: [12, 41]
                })
            });
            marker.addTo(layer);
            markerMap.set(id, marker);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchQuotes();
    initFilters();
    requestAPI();

    document.getElementById('generateButton').addEventListener('click', () => {
        const distance = parseFloat(document.getElementById('distanceInput').value);
        if (isNaN(distance) || distance <= 0) {
            alert('Please enter a valid distance.');
            return;
        }

        visualizeData();
    });

    document.getElementById('unitToggle').addEventListener('click', (e) => {
        if (e.target.classList.contains('unit-option'))
            toggleUnit(e.target.dataset.unit);
    });

    document.getElementById('clearButton').addEventListener('click', clearRoute);

    document.getElementById('quoteContainer').addEventListener('click', displayRandomQuote);

    document.getElementById('fullscreenButton').addEventListener('click', (event) => {
        toggleFullscreen();
        event.stopPropagation();
    });

    document.getElementById('fullscreenButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });


    document.getElementById('relocateButton').addEventListener('click', (event) => {
        relocateToOriginalPosition();
        event.stopPropagation();
    });

    document.getElementById('relocateButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(autocompleteTimeout);
        autocompleteTimeout = setTimeout(searchLocation, 300);
    });

    document.getElementById('searchInput').addEventListener('keydown', function (event) {
        if (event.key === "Enter") {
            searchLocation(); // Call the searchLocation function
            console.log("Searching location..."); // Fixing console log
        }
    }); // THiS IS NO WORK 

    document.getElementById('searchButton').addEventListener('click', (event) => {
        searchLocation()
        event.stopPropagation()
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('#searchContainer')) {
            document.getElementById('autocompleteResults').style.display = 'none';
        }
        event.stopPropagation(); // NOT WORKING FOR SOEM REASON 
    });

    document.getElementById('undoButton').addEventListener('click', (event) => {
        undo()
        event.stopPropagation();
    });

    document.getElementById('undoButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });


    document.getElementById('redoButton').addEventListener('click', (event) => {
        redo()
        event.stopPropagation();
    });

    document.getElementById('redoButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });


    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            redo();
        }
    });

    const termsLink = document.getElementById('termsLink');
    const termsDialog = document.getElementById('termsDialog');
    const closeButton = document.querySelector('.close');

    termsLink.addEventListener('click', (e) => {
        e.preventDefault();
        termsDialog.style.display = 'flex';
    });

    closeButton.addEventListener('click', () => {
        termsDialog.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === termsDialog) {
            termsDialog.style.display = 'none';
        }
    });

    const creditsLink = document.getElementById('creditsLink');
    const creditsDialog = document.getElementById('creditsDialog');
    const closeButton2 = document.querySelector('.close2');

    creditsLink.addEventListener('click', (e) => {
        e.preventDefault();
        creditsDialog.style.display = 'flex';
    });

    closeButton2.addEventListener('click', () => {
        creditsDialog.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === creditsDialog) {
            creditsDialog.style.display = 'none';
        }
    });


    document.getElementById('uploadButton').addEventListener('click', () => {
        alert('Upload functionality is not implemented yet.');
    });

    document.getElementById('downloadButton').addEventListener('click', () => {
        alert('Download functionality is not implemented yet.');
    });

    document.getElementById('shareButton').addEventListener('click', () => {
        alert('Share functionality is not implemented yet.');
    });

    document.getElementById('distanceInput').addEventListener("change", () => {
        let distance = parseFloat(document.getElementById('distanceInput').value);
        if (currentUnit === "mi") {
            distance *= kmConstant;
        }

        if (previousDistance !== distance) {
            console.log("Distance Changed");
            fetchData();
            previousDistance = distance;
        }
    });


    // Shows the filter tab when clicked
    document.addEventListener('click', function (event) {
        const selectWrapper = document.querySelector('.select-wrapper');
        const optionsContainer = document.getElementById('optionsContainer');

        if (!selectWrapper.contains(event.target)) {
            optionsContainer.classList.remove('show');
        }
        event.stopPropagation();
    });

    // Changes the check box
    const options = document.querySelectorAll('.option');
    options.forEach(option => {
        option.addEventListener('click', function (event) {
            event.stopPropagation();
            const checkbox = this.querySelector('input[type="checkbox"]');
            if (event.target !== checkbox && event.target !== checkbox
                .nextElementSibling) {
                if (isLayerToggling || isTrafficLightToggling || isBathroomToggling)
                    return;
                checkbox.checked = !checkbox.checked;
            }
        });
    });

    // Traffic Light Toggle 
    document.getElementById('showTrafficLights').addEventListener('click', (event) => {
        toggleTrafficLights()
    });

    document.getElementById('showTrafficLights2').addEventListener('click', (event) => {
        toggleTrafficLights()
    });

    document.getElementById('showBathrooms').addEventListener('click', (event) => {
        toggleBathrooms()
    });

    document.getElementById('showBathrooms2').addEventListener('dblclick', (event) => {
        event.stopPropagation();
    }); 


    document.getElementById('satelliteView').addEventListener('click', () => {
        toggleSatelliteView()
    });
    
    document.getElementById('satelliteView2').addEventListener('click', () => {
        toggleSatelliteView()
    });

    document.getElementById('satelliteView').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    // document.getElementById('map-info').addEventListener('click', (event) => {
    //     // toggleUnit(e.target.dataset.unit);

    //     event.stopPropagation(); 
    // }); 


    //_________________________________________



}); 