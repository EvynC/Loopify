// Instance Variables
            let map, userLocationCircle;
            let currentUnit = 'mi';
            let kmConstant = 1.60934;
            let waypoints = [];
            let userWaypoints = [];
            let lastWaypoint = "";
            let targetDistance = 0;
            let currentDistance = 0;
            let currentElevation = 0;
            let quotes = [];
            let markers = [];
            let autocompleteTimeout;
            let isSearching = false;
            let originalPosition;
            let undoStack = [];
            let redoStack = [];
            let snappedLatLng = [];
            let previousDistance = 0.25 * kmConstant;
            let bathroomLayer, trafficLightLayer, satelliteLayer;
            let showBathrooms = true;
            let showTrafficLights = true;

            function initMap() {
                map = L.map('map').setView([0, 0], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                bathroomLayer = L.layerGroup().addTo(map);
                trafficLightLayer = L.layerGroup().addTo(map);

                promptForLocation();

                map.on('zoomend', updateUserLocationCircleSize);
                map.on('click', onMapClick);
                map.on('moveend', updateObjects);
                map.on('zoomend', updateObjects);
            }

            function updateObjects() {
                UpdateObject("bathroom")
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
                    color: '#0031d1',
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

            function onMapClick(e) {
                if (!isSearching) {
                    const [snappedLat, snappedLon] = snapToNearestEdge(e.latlng.lat, e.latlng.lng);
                    startingNode = {
                        lat: snappedLat,
                        lon: snappedLon
                    };
                    addWaypoint(L.latLng(snappedLat, snappedLon));
                    fetchData();
                }
            }

            function addWaypoint(latlng) {
                const [snappedLat, snappedLon] = snapToNearestEdge(latlng.lat, latlng.lng);
                snappedLatLng = L.latLng(snappedLat, snappedLon);

                undoStack.push([...waypoints]);
                redoStack = [];

                const newMarker = L.circleMarker(snappedLatLng, {
                    color: waypoints.length === 0 ? 'green' : 'red',
                    fillColor: waypoints.length === 0 ? 'green' : 'red',
                    fillOpacity: 0.5,
                    radius: waypoints.length === 0 ? 10 : 8
                }).addTo(map);

                markers.push(newMarker);
                waypoints.push(snappedLatLng);

                if (markers.length > 1) {
                    const previousMarker = markers[markers.length - 2];
                    previousMarker.setStyle({
                        color: 'blue',
                        fillColor: 'blue'
                    });

                    // Draw a line between the last two waypoints
                    L.polyline([waypoints[waypoints.length - 2], snappedLatLng], {
                        color: '#6FA1EC',
                        weight: 4
                    }).addTo(map);
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

            function calculateMockElevation(distance) {
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
                    } else if (mapElement.mozRequestFullScreen) {
                        mapElement.mozRequestFullScreen();
                    } else if (mapElement.webkitRequestFullscreen) {
                        mapElement.webkitRequestFullscreen();
                    } else if (mapElement.msRequestFullscreen) {
                        mapElement.msRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.mozCancelFullScreen) {
                        document.mozCancelFullScreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    } else if (document.msExitFullscreen) {
                        document.msExitFullscreen();
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
                    const newMarker = L.circleMarker(latlng, {
                        color: index === 0 ? 'green' : index === waypoints.length - 1 ? 'red' : 'blue',
                        fillColor: index === 0 ? 'green' : index === waypoints.length - 1 ? 'red' :
                            'blue',
                        fillOpacity: 0.5,
                        radius: index === 0 ? 10 : 8
                    }).addTo(map);
                    markers.push(newMarker);

                    if (index > 1) {
                        L.polyline([waypoints[index - 1], latlng], {
                            color: '#6FA1EC',
                            weight: 4
                        }).addTo(map);
                    }
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

            async function UpdateObject(object) {
                const bounds = map.getBounds();
                const zoom = map.getZoom();


                if (object == "bathroom") {
                    if (showBathrooms) {
                        bathroomLayer.clearLayers();
                        const bathrooms = await fetchAndFilterObjects(
                            `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="toilets"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
                            './assets/Bathroom.png'
                        );

                        bathrooms.forEach(bathroom => {
                            L.marker([bathroom.lat, bathroom.lon], {
                                icon: L.icon({
                                    iconUrl: './assets/Bathroom.png',
                                    iconSize: [25, 25],
                                    iconAnchor: [12, 41]
                                })
                            }).addTo(bathroomLayer);
                        });
                    } else {
                        map.removeLayer(bathroomLayer);
                    }



                }
            }


            // async function updateObjects() {
            //     if (!map || !bathroomLayer || !trafficLightLayer) return;

            //     const bounds = map.getBounds();
            //     const zoom = map.getZoom();

            //     // Only fetch and display objects if zoom level is appropriate
            //     if (zoom >= 14) {
            //         if (showBathrooms) {
            //             bathroomLayer.clearLayers();
            //             const bathrooms = await fetchAndFilterObjects(
            //                 `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="toilets"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
            //                 './assets/Bathroom.png'
            //             );
            //             bathrooms.forEach(bathroom => {
            //                 L.marker([bathroom.lat, bathroom.lon], {
            //                     icon: L.icon({
            //                         iconUrl: './assets/Bathroom.png',
            //                         iconSize: [25, 25],
            //                         iconAnchor: [12, 41]
            //                     })
            //                 }).addTo(bathroomLayer);
            //             });
            //         } else {
            //             bathroomLayer.clearLayers();
            //         }

            //         if (showTrafficLights) {
            //             trafficLightLayer.clearLayers();
            //             const trafficLights = await fetchAndFilterObjects(
            //                 `https://overpass-api.de/api/interpreter?data=[out:json];node["highway"="traffic_signals"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
            //                 './assets/TrafficLight.png'
            //             );
            //             trafficLights.forEach(light => {
            //                 L.marker([light.lat, light.lon], {
            //                     icon: L.icon({
            //                         iconUrl: './assets/TrafficLight.png',
            //                         iconSize: [25, 25],
            //                         iconAnchor: [12, 41]
            //                     })
            //                 }).addTo(trafficLightLayer);
            //             });
            //         }
            //     } else {
            //         // Clear layers when zoom level is too low
            //         bathroomLayer.clearLayers();
            //         trafficLightLayer.clearLayers();
            //     }
            // }

            function toggleDropdown() {
                const optionsContainer = document.getElementById('optionsContainer');
                optionsContainer.classList.toggle('show');
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
                var d = new Date();
                try {
                    graph = await fetchRoadData(bbox);

                    if (Object.keys(graph.nodes).length === 0) {
                        throw new Error(
                            'No road data found in the selected area. Try moving the map or increasing the distance.'
                        );
                    }

                    console.log(
                        `Fetched ${Object.keys(graph.nodes).length} nodes and ${Object.keys(graph.edges).length} edges`
                    );
                    var time = (d.getMinutes() * 60) + d.getSeconds() + (d.getMilliseconds() / 1000);
                    var d = new Date();
                    var totalTime = (((d.getMinutes() * 60) + d.getSeconds() + (d.getMilliseconds() / 1000)) -
                        time)
                    totalTime = Number(totalTime.toFixed(5))
                    console.log("Loaded in ", totalTime, " Seconds. ")

                } catch (error) {
                    console.error('Error fetching road data:', error);
                }
            }

            function createRoute() {
                // Implement route creation logic here
            }

            function initFilters() {
                satelliteLayer =
                    L.tileLayer(
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping,Aerogrid,IGN,IGP,UPR - EGP,and the GIS User Community '
                        });

                bathroomLayer = L.layerGroup().addTo(map);
                trafficLightLayer = L.layerGroup().addTo(map);

                document.getElementById('satelliteView').checked = false;
                document.getElementById('hideBathrooms').checked = true;
                document.getElementById('hideTrafficLights').checked = true;

                toggleSatelliteView.call(document.getElementById('satelliteView'));
                toggleBathrooms.call(document.getElementById('hideBathrooms'));
                toggleTrafficLights.call(document.getElementById('hideTrafficLights'));

                document.getElementById('satelliteView').addEventListener('change', toggleSatelliteView);
                document.getElementById('hideBathrooms').addEventListener('change', toggleBathrooms);
                document.getElementById('hideTrafficLights').addEventListener('change', toggleTrafficLights);
            }

            function toggleSatelliteView() {
                if (this.checked) {
                    map.addLayer(satelliteLayer);
                } else {
                    map.removeLayer(satelliteLayer);
                }
            }

            async function fetchBathrooms(bounds) {
                const overpassUrl = 'https://overpass-api.de/api/interpreter';
                const query = `
            [out:json];
            (
            node["amenity"="toilets"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
            );
            out body;
            `;

                try {
                    const response = await fetch(overpassUrl, {
                        method: 'POST',
                        body: `data=${encodeURIComponent(query)}`,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    return data.elements.map(element => ({
                        lat: element.lat,
                        lon: element.lon,
                        tags: element.tags
                    }));
                } catch (error) {
                    console.error('Error fetching bathrooms:', error);
                    return [];
                }
            }

            async function fetchTrafficLights(bounds) {
                const overpassUrl = 'https://overpass-api.de/api/interpreter';
                const query = `
            [out:json];
            (
            node["highway"="traffic_signals"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
            );
            out body;
            `;

                try {
                    const response = await fetch(overpassUrl, {
                        method: 'POST',
                        body: `data=${encodeURIComponent(query)}`,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    return data.elements.map(element => ({
                        lat: element.lat,
                        lon: element.lon,
                        tags: element.tags
                    }));
                } catch (error) {
                    console.error('Error fetching traffic lights:', error);
                    return [];
                }
            }

            function toggleBathrooms() {
                showBathrooms = !showBathrooms;
                UpdateObject("bathroom")
            }

            function toggleTrafficLights() {
                showTrafficLights = !showTrafficLights;
                updateObjects();
            }

            function updateBathrooms() {
                if (!map.hasLayer(bathroomLayer)) return;

                bathroomLayer.clearLayers();
                const bounds = map.getBounds();
                fetchBathrooms(bounds).then(bathrooms => {
                    filterObjects(bathrooms, "./assets/Bathroom.png").forEach(bathroom => {
                        L.marker([bathroom.lat, bathroom.lon], {
                            icon: L.icon({
                                iconUrl: './assets/Bathroom.png',
                                iconSize: [25, 25],
                                iconAnchor: [12, 41]
                            })
                        }).addTo(bathroomLayer);
                    });
                });
            }

            function updateTrafficLights() {
                if (!map.hasLayer(trafficLightLayer)) return;

                trafficLightLayer.clearLayers();
                const bounds = map.getBounds();
                fetchTrafficLights(bounds).then(lights => {
                    filterObjects(lights, "./assets/TrafficLight.png").forEach(light => {
                        L.marker([light.lat, light.lon], {
                            icon: L.icon({
                                iconUrl: './assets/TrafficLight.png',
                                iconSize: [25, 25],
                                iconAnchor: [12, 41]
                            })
                        }).addTo(trafficLightLayer);
                    });
                });
            }

            // Update the existing filterObjects function
            function filterObjects(objects, path) {
                const thresholdDistance = 100; // Meters
                const filteredObjects = [];

                objects.forEach(function (object) {
                    let shouldAdd = true;
                    filteredObjects.forEach(function (filteredObject) {
                        const distance = haversineDistance(
                            filteredObject.lat,
                            filteredObject.lon,
                            object.lat,
                            object.lon
                        ) * 1000; // Convert km to meters

                        if (distance < thresholdDistance) {
                            shouldAdd = false;
                        }
                    });
                    if (shouldAdd) {
                        filteredObjects.push(object);
                    }
                });
                return filteredObjects;
            }


            document.addEventListener('DOMContentLoaded', () => {
                initMap();
                fetchQuotes();
                initFilters();

                map.on('moveend', function () {
                    // updateBathrooms();
                    UpdateObject("bathroom")
                    // updateTrafficLights();
                });

                document.getElementById('hideBathrooms').addEventListener('change', toggleBathrooms);
                // document.getElementById('hideTrafficLights').addEventListener('change', toggleTrafficLights);


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

                document.getElementById('fullscreenButton').addEventListener('click', toggleFullscreen);

                document.getElementById('relocateButton').addEventListener('click',
                    relocateToOriginalPosition);

                document.getElementById('searchInput').addEventListener('input', () => {
                    clearTimeout(autocompleteTimeout);
                    autocompleteTimeout = setTimeout(searchLocation, 300);
                });

                document.getElementById('searchInput').addEventListener('keyup', function (event) {
                    if (event.key === "Enter") {
                        searchLocation(); // Call the searchLocation function
                        console.log("Searching location..."); // Fixing console log
                    }
                }); // THiS IS NO WORK 

                document.getElementById('searchButton').addEventListener('click', searchLocation);

                document.addEventListener('click', (e) => {

                    if (!e.target.closest('#searchContainer')) {
                        document.getElementById('autocompleteResults').style.display = 'none';
                    }
                });

                document.getElementById('undoButton').addEventListener('click', undo);
                document.getElementById('redoButton').addEventListener('click', redo);

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

                document.addEventListener('click', function (event) {
                    const selectWrapper = document.querySelector('.select-wrapper');
                    const optionsContainer = document.getElementById('optionsContainer');

                    if (!selectWrapper.contains(event.target)) {
                        optionsContainer.classList.remove('show');
                    }
                });

                const options = document.querySelectorAll('.option');
                options.forEach(option => {
                    option.addEventListener('click', function (event) {
                        const checkbox = this.querySelector('input[type="checkbox"]');
                        if (event.target !== checkbox && event.target !== checkbox
                            .nextElementSibling) {
                            checkbox.checked = !checkbox.checked;
                        }
                        event.stopPropagation();
                    });
                });
            });