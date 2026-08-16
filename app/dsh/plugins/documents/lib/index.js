/**
 * Documents Generation Plugin for DeepSeek Harness
 * Generate PRDs, proposals, meeting notes, project summaries, weekly/monthly reports
 * Essential for product managers, operations, and marketing personnel
 */
export class DocumentsPlugin {
  name = 'documents';
  description = 'Document generation - PRDs, proposals, meeting notes, reports';
  
  constructor(ctx) {
    this.ctx = ctx;
  }

  async activate() {
    console.log('[Documents Plugin] Activated');
  }

  async deactivate() {
    console.log('[Documents Plugin] Deactivated');
  }

  async generatePRD(options) {
    const { title, problem, solution, targetUsers, features, timeline } = options;
    
    return {
      title: title || 'Product Requirements Document',
      sections: [
        {
          title: 'Executive Summary',
          content: `This document outlines the requirements for ${title || 'the new feature'}.`
        },
        {
          title: 'Problem Statement',
          content: problem || 'Define the problem you are solving'
        },
        {
          title: 'Proposed Solution',
          content: solution || 'Describe your proposed solution'
        },
        {
          title: 'Target Users',
          content: targetUsers || 'Identify your target users'
        },
        {
          title: 'Features',
          content: features || 'List the key features'
        },
        {
          title: 'Timeline',
          content: timeline || 'Project timeline and milestones'
        },
        {
          title: 'Success Metrics',
          content: 'Define how you will measure success'
        }
      ]
    };
  }

  async generateProposal(options) {
    const { title, background, objectives, approach, budget, timeline } = options;
    
    return {
      title: title || 'Project Proposal',
      sections: [
        {
          title: 'Background',
          content: background || 'Provide context and background information'
        },
        {
          title: 'Objectives',
          content: objectives || 'Define the project objectives'
        },
        {
          title: 'Proposed Approach',
          content: approach || 'Describe your approach'
        },
        {
          title: 'Budget',
          content: budget || 'Outline the budget requirements'
        },
        {
          title: 'Timeline',
          content: timeline || 'Project timeline'
        },
        {
          title: 'Expected Outcomes',
          content: 'Describe the expected outcomes and benefits'
        }
      ]
    };
  }

  async generateMeetingNotes(options) {
    const { title, date, attendees, agenda, discussion, actionItems } = options;
    
    return {
      title: title || 'Meeting Notes',
      date: date || new Date().toISOString().split('T')[0],
      attendees: attendees || [],
      sections: [
        {
          title: 'Agenda',
          content: agenda || 'Meeting agenda items'
        },
        {
          title: 'Discussion Points',
          content: discussion || 'Summary of discussion'
        },
        {
          title: 'Decisions Made',
          content: 'Key decisions and conclusions'
        },
        {
          title: 'Action Items',
          content: actionItems || 'List action items with owners and deadlines'
        },
        {
          title: 'Next Meeting',
          content: 'Date and topics for next meeting'
        }
      ]
    };
  }

  async generateWeeklyReport(options) {
    const { week, accomplishments, challenges, nextWeekPlan, metrics } = options;
    
    return {
      title: `Weekly Report - ${week || 'Week ' + this.getWeekNumber()}`,
      sections: [
        {
          title: 'Accomplishments',
          content: accomplishments || 'What was accomplished this week'
        },
        {
          title: 'Challenges',
          content: challenges || 'Any challenges or blockers'
        },
        {
          title: 'Metrics',
          content: metrics || 'Key performance metrics'
        },
        {
          title: 'Next Week Plan',
          content: nextWeekPlan || 'Plans for next week'
        }
      ]
    };
  }

  async generateProjectSummary(options) {
    const { projectName, status, progress, risks, nextSteps } = options;
    
    return {
      title: `Project Summary - ${projectName || 'Project'}`,
      sections: [
        {
          title: 'Project Status',
          content: status || 'Current project status'
        },
        {
          title: 'Progress',
          content: progress || 'Progress against milestones'
        },
        {
          title: 'Risks and Issues',
          content: risks || 'Current risks and issues'
        },
        {
          title: 'Next Steps',
          content: nextSteps || 'Upcoming activities'
        }
      ]
    };
  }

  async toMarkdown(document) {
    let markdown = `# ${document.title}\n\n`;
    
    for (const section of document.sections) {
      markdown += `## ${section.title}\n\n`;
      markdown += `${section.content}\n\n`;
    }
    
    return markdown;
  }

  async toHTML(document) {
    const md = await this.toMarkdown(document);
    const markdownIt = await import('markdown-it');
    const mdParser = new markdownIt.default();
    return mdParser.render(md);
  }

  async toDOCX(document) {
    const docx = await import('docx');
    
    const children = [
      new docx.Paragraph({
        text: document.title,
        heading: docx.HeadingLevel.HEADING_1
      })
    ];
    
    for (const section of document.sections) {
      children.push(
        new docx.Paragraph({
          text: section.title,
          heading: docx.HeadingLevel.HEADING_2
        }),
        new docx.Paragraph({
          text: section.content
        })
      );
    }
    
    const doc = new docx.Document({
      sections: [{
        children
      }]
    });
    
    return await docx.Packer.toBuffer(doc);
  }

  async toPDF(document) {
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    
    // Add title
    page.drawText(document.title, {
      x: 50,
      y: page.getHeight() - 50,
      size: 20,
      color: rgb(0, 0, 0)
    });
    
    let y = page.getHeight() - 80;
    
    for (const section of document.sections) {
      page.drawText(section.title, {
        x: 50,
        y,
        size: 14,
        color: rgb(0.2, 0.2, 0.2)
      });
      
      y -= 20;
      
      // Wrap text for PDF
      const lines = this.wrapText(section.content, 80);
      for (const line of lines) {
        page.drawText(line, {
          x: 50,
          y,
          size: 12,
          color: rgb(0, 0, 0)
        });
        y -= 15;
      }
      
      y -= 10;
    }
    
    return await pdfDoc.save();
  }

  wrapText(text, maxCharsPerLine) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.ceil(diff / oneWeek);
  }
}

export default DocumentsPlugin;
