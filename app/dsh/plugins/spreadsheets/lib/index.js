/**
 * Spreadsheets Plugin for DeepSeek Harness
 * AI data analyst - analyze data, generate charts, output reports
 * More than just spreadsheets - provides insights and conclusions
 */
export class SpreadsheetsPlugin {
  name = 'spreadsheets';
  description = 'Data analysis - analyze data, generate charts, output reports';
  
  constructor(ctx) {
    this.ctx = ctx;
  }

  async activate() {
    console.log('[Spreadsheets Plugin] Activated');
  }

  async deactivate() {
    console.log('[Spreadsheets Plugin] Deactivated');
  }

  async analyzeData(data, options = {}) {
    const analysis = {
      summary: this.generateSummary(data),
      statistics: this.calculateStatistics(data),
      insights: this.generateInsights(data),
      recommendations: this.generateRecommendations(data)
    };
    
    return analysis;
  }

  generateSummary(data) {
    if (!data || data.length === 0) {
      return { rows: 0, columns: 0, empty: true };
    }
    
    const columns = Object.keys(data[0]);
    const summary = {
      rows: data.length,
      columns: columns.length,
      columnNames: columns
    };
    
    // Analyze each column
    for (const column of columns) {
      const values = data.map(row => row[column]).filter(v => v !== undefined && v !== null);
      summary[column] = {
        type: this.detectColumnType(values),
        count: values.length,
        missing: data.length - values.length
      };
    }
    
    return summary;
  }

  detectColumnType(values) {
    if (values.length === 0) return 'empty';
    
    const sample = values.slice(0, 10);
    const numericCount = sample.filter(v => !isNaN(v)).length;
    const dateCount = sample.filter(v => !isNaN(Date.parse(v))).length;
    
    if (numericCount > sample.length * 0.8) return 'numeric';
    if (dateCount > sample.length * 0.8) return 'date';
    return 'text';
  }

  calculateStatistics(data) {
    const stats = {};
    const columns = Object.keys(data[0] || {});
    
    for (const column of columns) {
      const values = data.map(row => row[column]).filter(v => !isNaN(v) && v !== null && v !== undefined);
      
      if (values.length > 0) {
        const numbers = values.map(Number);
        stats[column] = {
          count: numbers.length,
          sum: numbers.reduce((a, b) => a + b, 0),
          average: numbers.reduce((a, b) => a + b, 0) / numbers.length,
          min: Math.min(...numbers),
          max: Math.max(...numbers),
          median: this.calculateMedian(numbers),
          stdDev: this.calculateStandardDeviation(numbers)
        };
      }
    }
    
    return stats;
  }

  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  calculateStandardDeviation(numbers) {
    const average = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squareDiffs = numbers.map(n => Math.pow(n - average, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / numbers.length;
    return Math.sqrt(avgSquareDiff);
  }

  generateInsights(data) {
    const insights = [];
    const stats = this.calculateStatistics(data);
    
    for (const [column, stat] of Object.entries(stats)) {
      if (stat.max > stat.average * 2) {
        insights.push({
          type: 'outlier',
          column,
          message: `Column "${column}" has potential outliers (max ${stat.max} is much higher than average ${stat.average.toFixed(2)})`
        });
      }
      
      if (stat.stdDev > stat.average * 0.5) {
        insights.push({
          type: 'high-variance',
          column,
          message: `Column "${column}" has high variance (std dev ${stat.stdDev.toFixed(2)})`
        });
      }
    }
    
    // Check for correlations
    const columns = Object.keys(data[0] || {});
    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        const correlation = this.calculateCorrelation(data, columns[i], columns[j]);
        if (Math.abs(correlation) > 0.7) {
          insights.push({
            type: 'correlation',
            columns: [columns[i], columns[j]],
            correlation,
            message: `Strong ${correlation > 0 ? 'positive' : 'negative'} correlation between "${columns[i]}" and "${columns[j]}" (${correlation.toFixed(2)})`
          });
        }
      }
    }
    
    return insights;
  }

  calculateCorrelation(data, col1, col2) {
    const values1 = data.map(row => row[col1]).filter(v => !isNaN(v)).map(Number);
    const values2 = data.map(row => row[col2]).filter(v => !isNaN(v)).map(Number);
    
    const minLength = Math.min(values1.length, values2.length);
    if (minLength < 2) return 0;
    
    const v1 = values1.slice(0, minLength);
    const v2 = values2.slice(0, minLength);
    
    const mean1 = v1.reduce((a, b) => a + b, 0) / minLength;
    const mean2 = v2.reduce((a, b) => a + b, 0) / minLength;
    
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;
    
    for (let i = 0; i < minLength; i++) {
      const diff1 = v1[i] - mean1;
      const diff2 = v2[i] - mean2;
      numerator += diff1 * diff2;
      denominator1 += diff1 * diff1;
      denominator2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denominator1 * denominator2);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  generateRecommendations(data) {
    const recommendations = [];
    const insights = this.generateInsights(data);
    
    for (const insight of insights) {
      switch (insight.type) {
        case 'outlier':
          recommendations.push({
            priority: 'high',
            action: `Investigate outliers in column "${insight.column}"`,
            reason: 'Outliers may indicate data quality issues or interesting phenomena'
          });
          break;
        case 'correlation':
          recommendations.push({
            priority: 'medium',
            action: `Explore relationship between "${insight.columns[0]}" and "${insight.columns[1]}"`,
            reason: 'Strong correlation may indicate causal relationship'
          });
          break;
      }
    }
    
    return recommendations;
  }

  async generateChart(data, chartType, options = {}) {
    const { xColumn, yColumn, title } = options;
    
    const chartData = {
      type: chartType,
      data: {
        labels: data.map(row => row[xColumn]),
        datasets: [{
          label: yColumn || 'Value',
          data: data.map(row => row[yColumn]),
          backgroundColor: this.getChartColors(chartType, data.length)
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: !!title,
            text: title || ''
          }
        }
      }
    };
    
    return chartData;
  }

  getChartColors(chartType, count) {
    const colors = [
      'rgba(54, 162, 235, 0.6)',
      'rgba(255, 99, 132, 0.6)',
      'rgba(75, 192, 192, 0.6)',
      'rgba(255, 205, 86, 0.6)',
      'rgba(153, 102, 255, 0.6)',
      'rgba(255, 159, 64, 0.6)',
      'rgba(199, 199, 199, 0.6)',
      'rgba(83, 102, 255, 0.6)',
      'rgba(255, 99, 255, 0.6)',
      'rgba(99, 255, 132, 0.6)'
    ];
    
    return Array(count).fill(null).map((_, i) => colors[i % colors.length]);
  }

  async exportToCSV(data, filename) {
    const Papa = (await import('papaparse')).default;
    return Papa.unparse(data);
  }

  async exportToExcel(data, filename) {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  async importFromCSV(csvString) {
    const Papa = (await import('papaparse')).default;
    return Papa.parse(csvString, { header: true, dynamicTyping: true }).data;
  }

  async importFromExcel(buffer) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'array' });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    return XLSX.utils.sheet_to_json(ws);
  }

  async createPivotTable(data, rows, columns, values) {
    const pivot = {};
    
    for (const row of data) {
      const rowKey = rows.map(r => row[r]).join('|');
      const colKey = columns.map(c => row[c]).join('|');
      
      if (!pivot[rowKey]) pivot[rowKey] = {};
      if (!pivot[rowKey][colKey]) pivot[rowKey][colKey] = [];
      
      for (const value of values) {
        pivot[rowKey][colKey].push(row[value]);
      }
    }
    
    // Calculate aggregates
    for (const rowKey of Object.keys(pivot)) {
      for (const colKey of Object.keys(pivot[rowKey])) {
        const values = pivot[rowKey][colKey];
        pivot[rowKey][colKey] = {
          sum: values.reduce((a, b) => a + b, 0),
          average: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    }
    
    return pivot;
  }

  async filterData(data, filters) {
    return data.filter(row => {
      return filters.every(filter => {
        const { column, operator, value } = filter;
        const rowValue = row[column];
        
        switch (operator) {
          case 'equals': return rowValue === value;
          case 'not_equals': return rowValue !== value;
          case 'greater_than': return rowValue > value;
          case 'less_than': return rowValue < value;
          case 'contains': return String(rowValue).includes(value);
          case 'starts_with': return String(rowValue).startsWith(value);
          case 'ends_with': return String(rowValue).endsWith(value);
          default: return true;
        }
      });
    });
  }

  async sortData(data, sortConfig) {
    return [...data].sort((a, b) => {
      for (const { column, direction } of sortConfig) {
        const aVal = a[column];
        const bVal = b[column];
        
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
}

export default SpreadsheetsPlugin;
