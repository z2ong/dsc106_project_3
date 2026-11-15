import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const mapWidth = 860;
const mapHeight = 360;

const margin = { top: 25, right: 100, bottom: 45, left: 60 };
const width = 860 - margin.left - margin.right;
const height = 450 - margin.top - margin.bottom;

const mapSvg = d3.select("#map-container")
    .append("svg")
    .attr("width", mapWidth)
    .attr("height", mapHeight);

const projection = d3.geoEquirectangular()
    .scale(135)
    .translate([mapWidth / 2, mapHeight / 2]);

const geoPath = d3.geoPath().projection(projection);

const chartSvg = d3.select("#chart-container")
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

const color = d3.scaleOrdinal()
    .domain(["historical", "ssp126", "ssp585"])
    .range(["#4682B4", "#FF8C00", "#db5d9c"]);

const regionBounds = [
    { name: "North America", lon: [-170, -50], lat: [15, 75] },
    { name: "South America", lon: [-90, -35],   lat: [-56, 12] },
    { name: "Europe",        lon: [-10, 40],   lat: [35, 71] },
    { name: "Africa",        lon: [-20, 50],   lat: [-35, 37] },
    { name: "Asia",          lon: [40, 180],   lat: [10, 75] },
    { name: "Oceania",       lon: [110, 170],  lat: [-10, 10] },
    { name: "Australia",     lon: [110, 155],  lat: [-45, -10] },
    { name: "Arctic",        lon: [-180, 180], lat: [65, 89.5] },
    { name: "Antarctica",    lon: [-180, 180], lat: [-89.5, -60] }
];

function makeRegionPolygon(region) {
    const [lonMin, lonMax] = region.lon;
    const [latMin, latMax] = region.lat;

    const topEdge = d3.range(lonMin, lonMax + 1, 5).map(lon => [lon, latMax]);
    const bottomEdge = d3.range(lonMax, lonMin - 1, -5).map(lon => [lon, latMin]);
    const coordinates = [[...topEdge, ...bottomEdge, topEdge[0]]];

    return {
        type: "Feature",
        properties: { name: region.name },
        geometry: { type: "Polygon", coordinates: coordinates }
    };
}

const regionFeatures = regionBounds.map(makeRegionPolygon);

let currentRegion = "North America";

async function init() {
    try {
        const worldData = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        const data = await d3.csv("regional_temperatures.csv");

        data.forEach(d => {
            d.year = +d.year;
            d.tas_anomaly = +d.tas_anomaly;
        });
        
        const periodRows = data.filter(d =>
    d.region === "North America" &&
    d.year >= 2081 &&
    d.year <= 2100
);

const averageFor = scenario => d3.mean(
    periodRows.filter(d => d.scenario === scenario),
    d => d.tas_anomaly
);

const lower = averageFor("ssp126");
const higher = averageFor("ssp585");

console.table({
    lower: lower.toFixed(2),
    higher: higher.toFixed(2),
    gap: (higher - lower).toFixed(2)
});
    
    const periodSelect = d3.select("#comparison-period");

function renderComparison() {
    const start = Number(periodSelect.property("value"));
    const end = start + 19;
    const periodRows = data.filter(
        d => d.year >= start && d.year <= end
    );
    const rowsByRegion = d3.group(
        periodRows,
        d => d.region
    );
    const results = Array.from(
        rowsByRegion,
        ([region, rows]) => {
            const averageFor = scenario =>
                d3.mean(
                    rows.filter(
                        d => d.scenario === scenario
                    ),
                    d => d.tas_anomaly
                );
            const lower = averageFor("ssp126");
            const higher = averageFor("ssp585");
            return {
                region,
                lower,
                higher,
                gap: higher - lower
            };
        }
    );
    results.sort((a, b) => b.gap - a.gap);
    const margin = {
        top: 35,
        right: 85,
        bottom: 55,
        left: 125
    };
    const chartWidth = 540;
    const rowHeight = 44;
    const chartHeight = results.length * rowHeight;
    const svgWidth = chartWidth + margin.left + margin.right;
    const svgHeight = chartHeight + margin.top + margin.bottom;

    d3.select("#comparison-chart")
        .selectAll("*")
        .remove();
    const svg = d3
        .select("#comparison-chart")
        .append("svg")
        .attr(
            "viewBox",
            `0 0 ${svgWidth} ${svgHeight}`
        )
        .attr("class", "comparison-svg");
    const chart = svg
        .append("g")
        .attr(
            "transform",
            `translate(${margin.left},${margin.top})`
        );
    const x = d3
        .scaleLinear()
        .domain([
            0,
            d3.max(results, d => d.higher)
        ])
        .nice()
        .range([0, chartWidth]);
    const y = d3
        .scaleBand()
        .domain(results.map(d => d.region))
        .range([0, chartHeight])
        .padding(0.3);
    chart
        .append("g")
        .attr(
            "transform",
            `translate(0,${chartHeight})`
        )
        .call(
            d3.axisBottom(x)
                .ticks(5)
        );
    chart
        .append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + 40)
        .attr("text-anchor", "middle")
        .attr("class", "comparison-axis-label")
        .text("Average temperature anomaly (°C)");
    chart
        .append("g")
        .call(
            d3.axisLeft(y)
                .tickSize(0)
        )
        .call(g =>
            g.select(".domain").remove()
        );
    const row = chart
        .selectAll(".dumbbell-row")
        .data(results, d => d.region)
        .join("g")
        .attr("class", d =>
            d.region === currentRegion
                ? "dumbbell-row active"
                : "dumbbell-row"
        );
    row
        .append("line")
        .attr("class", "dumbbell-line")
        .attr("x1", d => x(d.lower))
        .attr("x2", d => x(d.higher))
        .attr(
            "y1",
            d => y(d.region) + y.bandwidth() / 2
        )
        .attr(
            "y2",
            d => y(d.region) + y.bandwidth() / 2
        );
    row
        .append("circle")
        .attr("class", "dumbbell-dot lower-dot")
        .attr("cx", d => x(d.lower))
        .attr(
            "cy",
            d => y(d.region) + y.bandwidth() / 2
        )
        .attr("r", 7);
    row
        .append("circle")
        .attr("class", "dumbbell-dot higher-dot")
        .attr("cx", d => x(d.higher))
        .attr(
            "cy",
            d => y(d.region) + y.bandwidth() / 2
        )
        .attr("r", 7);
    row
        .append("text")
        .attr("class", "gap-label")
        .attr(
            "x",
            d => x(d.higher) + 10
        )
        .attr(
            "y",
            d => y(d.region) + y.bandwidth() / 2
        )
        .attr("dy", "0.35em")
        .text(
            d => `+${d.gap.toFixed(2)}`
        );
    row
        .append("rect")
        .attr("class", "dumbbell-hitbox")
        .attr("x", 0)
        .attr(
            "y",
            d => y(d.region)
        )
        .attr("width", chartWidth)
        .attr(
            "height",
            y.bandwidth()
        )
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (_event, d) => {
            selectRegion(d.region);
        })
        .on("mouseover", function(event, d) {
            const parentRow =
                d3.select(this.parentNode);
            parentRow.classed(
                "hovered",
                true
            );
            tooltip
                .html(`
                    <strong>${d.region}</strong><br>
                    Projection period:
                    ${start}–${end}<br><br>

                    <span style="color:#FF8C00">
                        Lower emissions (SSP1-2.6):
                    </span>
                    <strong>
                        ${d.lower.toFixed(2)} °C
                    </strong><br>

                    <span style="color:#db5d9c">
                        Higher emissions (SSP5-8.5):
                    </span>
                    <strong>
                        ${d.higher.toFixed(2)} °C
                    </strong><br>

                    Scenario gap:
                    <strong>
                        ${d.gap.toFixed(2)} °C
                    </strong>
                `)
                .style(
                    "left",
                    `${event.pageX + 15}px`
                )
                .style(
                    "top",
                    `${event.pageY - 20}px`
                )
                .style("opacity", 1);
        })
        .on("mousemove", function(event) {
            tooltip
                .style(
                    "left",
                    `${event.pageX + 15}px`
                )
                .style(
                    "top",
                    `${event.pageY - 20}px`
                );
        })
        .on("mouseout", function() {
            const parentRow =
                d3.select(this.parentNode);
            parentRow.classed(
                "hovered",
                false
            );
            tooltip
                .style("opacity", 0);
        });
    const legend = svg
        .append("g")
        .attr(
            "transform",
            `translate(${margin.left},10)`
        );
    const legendItems = [
        {
            label: "Lower emissions",
            className: "lower-dot"
        },
        {
            label: "Higher emissions",
            className: "higher-dot"
        }
    ];
    const legendGroups = legend
        .selectAll(".comparison-legend-item")
        .data(legendItems)
        .join("g")
        .attr(
            "class",
            "comparison-legend-item"
        )
        .attr(
            "transform",
            (_d, i) =>
                `translate(${i * 145},0)`
        );
    legendGroups
        .append("circle")
        .attr("class", d =>
            `dumbbell-dot ${d.className}`
        )
        .attr("cx", 6)
        .attr("cy", 6)
        .attr("r", 5);
    legendGroups
        .append("text")
        .attr("x", 17)
        .attr("y", 10)
        .text(d => d.label);
}
periodSelect.on("change", renderComparison);
renderComparison();
        const countries = topojson.feature(worldData, worldData.objects.countries);
        mapSvg.append("g")
            .selectAll("path")
            .data(countries.features)
            .join("path")
            .attr("class", "land")
            .attr("d", geoPath);
        const regionPaths = mapSvg.append("g")
            .selectAll("path")
            .data(regionFeatures)
            .join("path")
            .attr("class", d => `region-box ${d.properties.name === currentRegion ? "active" : ""}`)
            .attr("d", geoPath)
            .on("click", (_event, d) => selectRegion(d.properties.name))
.on("mouseover", (event, d) => {
                tooltip.transition().duration(100).style("opacity", 0.95);
                tooltip.html(`Click to view <strong>${d.properties.name}</strong>`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 25) + "px");
            })
            .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0));
function selectRegion(region) {
    currentRegion = region;
    regionPaths.classed("active", d => d.properties.name === region);
    d3.select("#chart-title").text(`2. Temperature Anomaly Trajectory: ${region}`);
    updateChart(data);
    renderComparison();
}
        mapSvg.append("g")
            .selectAll("text")
            .data(regionFeatures)
            .join("text")
            .attr("class", "region-label")
            .attr("transform", d => {
                if (d.properties.name === "Arctic") return `translate(${projection([-30, 70])})`;
                if (d.properties.name === "Antarctica") return `translate(${projection([0, -70])})`;
                return `translate(${geoPath.centroid(d)})`;
            })
            .text(d => d.properties.name);
                d3.selectAll('input[name="scenario-filter"], input[name="time-span"]')
            .on("change", () => updateChart(data));

        selectRegion(currentRegion);

    } catch (error) {
        console.error("Error loading dataset or map:", error);
    }
}

function updateChart(data) {
    const regionData = data.filter(d => d.region === currentRegion);
    const selectedScenario = d3.select('input[name="scenario-filter"]:checked')
    .property("value");

const projectionsOnly = d3.select('input[name="time-span"]:checked')
    .property("value") === "future";

const [firstYear, lastYear] = d3.extent(regionData, d => d.year);
const startYear = projectionsOnly ? 2015 : firstYear;

const visibleRows = regionData.filter(d =>
    d.year >= startYear && (
        d.scenario === "historical" ||
        selectedScenario === "both" ||
        d.scenario === selectedScenario
    )
);

const nestedData = d3.group(visibleRows, d => d.scenario);

    chartSvg.selectAll(".rendered-element").remove();

    const x = d3.scaleLinear()
        .domain([startYear, lastYear])
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([-2, 12])
        .range([height, 0]);

    chartSvg.append("g")
        .attr("class", "rendered-element")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    chartSvg.append("g")
        .attr("class", "rendered-element")
        .call(d3.axisLeft(y));

    chartSvg.append("text")
        .attr("class", "rendered-element axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", -45)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .text("Temperature Anomaly (°C) vs. 1850–1900");

    chartSvg.append("line")
        .attr("class", "rendered-element")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", y(0)).attr("y2", y(0))
        .attr("stroke", "#888")
        .attr("stroke-dasharray", "4,4");

    const line = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.tas_anomaly));

    for (let [scenario, values] of nestedData) {
        chartSvg.append("path")
            .datum(values)
            .attr("class", "rendered-element line")
            .attr("stroke", color(scenario))
            .attr("d", line);
    }

    const hoverLine = chartSvg.append("line")
        .attr("class", "rendered-element")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#555")
        .attr("stroke-dasharray", "4,4")
        .style("opacity", 0);

    chartSvg.append("rect")
        .attr("class", "rendered-element")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "transparent")
        .style("pointer-events", "all")
        .on("mousemove", function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const hoverYear = x.invert(mouseX);
            hoverLine
                .attr("x1", mouseX)
                .attr("x2", mouseX)
                .style("opacity", 1);
            
            let tooltipContent = `<strong>Year: ${Math.round(hoverYear)}</strong><br>`;

            const scenarioNames = {
                historical: "Historical",
                ssp126: "Lower Emissions (SSP1-2.6)",
                ssp585: "Higher Emissions (SSP5-8.5)"
            };

            for (let [scenario, values] of nestedData) {

                if (hoverYear < 2014 && scenario !== "historical") {
                    continue;
                }

                if (hoverYear >= 2014 && scenario === "historical") {
                    continue;
                }

                const bisect = d3.bisector(d => d.year).center;
                const index = bisect(values, hoverYear);
                const point = values[index];

                const temperatureC = point.tas - 273.15;

                tooltipContent += `
                    <div style="color: ${color(scenario)}">
                        <strong>${scenarioNames[scenario] || scenario}</strong>
                    </div>

                    <div>
                        Data year: ${point.year}<br>
                        Temperature anomaly: ${point.tas_anomaly.toFixed(2)} °C<br>
                        Mean temperature: ${temperatureC.toFixed(2)} °C
                    </div>
                    <br>
                `;
            }
            tooltip
                .html(tooltipContent)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 15) + "px")
                .style("opacity", 1);
        })
        .on("mouseout", function() {
            tooltip.style("opacity", 0);
            hoverLine.style("opacity", 0);
        });

    const legend = chartSvg.append("g")
        .attr("class", "rendered-element")
        .attr("transform", `translate(${width + 15}, 10)`);

    [...nestedData.keys()].forEach((scen, i) => {
        const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", color(scen));
        row.append("text").attr("x", 18).attr("y", 10).style("font-size", "12px").text(scen);
    });
}

init();