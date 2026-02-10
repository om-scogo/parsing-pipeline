import * as crypto from 'crypto';
import { generateTableSummary, generateImageDescription } from './ai';

export interface UnstructuredElement {
    type: string;
    text: string;
    element_id: string;
    parent_id?: string;
    metadata: {
        coordinates?: any;
        filetype?: string;
        page_number?: number | number[];
        filename?: string;
        image_base64?: string;
        text_as_html?: string;
        searchable_summary?: string;
        description?: string;
        [key: string]: any;
    };
}

export interface Section {
    section_id: string;
    title: string;
    content: string;
    elements: UnstructuredElement[];
}

export class Processor {
    private generateId(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Normalizes text by removing redundant whitespace.
     */
    private normalizeText(text: string): string {
        return text.replace(/\s+/g, ' ').trim();
    }

    private filterMetadata(el: any): any {
        const metadata: any = {};
        const allowedKeys = ['coordinates', 'filetype', 'page_number', 'page_numbers', 'filename', 'searchable_summary', 'description'];

        for (const key of allowedKeys) {
            if (el.metadata && el.metadata[key] !== undefined) {
                metadata[key] = el.metadata[key];
            }
        }

        if (el.type.toLowerCase() === 'image' && el.metadata && el.metadata.image_base64) {
            metadata.image_base64 = el.metadata.image_base64;
        }

        if (el.type.toLowerCase() === 'table' && el.metadata && el.metadata.text_as_html) {
            metadata.text_as_html = el.metadata.text_as_html;
        }

        return metadata;
    }

    /**
     * Normalise chunks, remove headers/footers, and group consecutive elements.
     */
    process(elements: any[]): Section[] {
        // 1. Filter, Normalize, and Clean Metadata
        const cleanedElements: UnstructuredElement[] = elements
            .filter(el => {
                const type = el.type.toLowerCase();
                return (
                    type !== 'header' &&
                    type !== 'footer' &&
                    type !== 'uncategorised text'
                );
            })
            .map(el => ({
                type: el.type,
                text: this.normalizeText(el.text || ''),
                element_id: el.element_id || this.generateId(),
                metadata: this.filterMetadata(el)
            }));

        // 2. Group consecutive ListItems/Lists only (limit 10); after 10, start new section
        const groupedElements: UnstructuredElement[] = [];
        let currentGroup: UnstructuredElement | null = null;
        let groupCount = 0;

        const isListType = (t: string) => {
            const lower = t.toLowerCase();
            return lower === 'listitem' || lower === 'list';
        };

        for (const el of cleanedElements) {
            const type = el.type.toLowerCase();
            const mergable = isListType(type);

            if (
                mergable &&
                currentGroup &&
                isListType(currentGroup.type) &&
                groupCount < 10
            ) {
                // Merge (only list/listitem, up to 10)
                currentGroup.text += '\n- ' + el.text;
                groupCount++;
                if (el.metadata.page_number) {
                    const currentPage = currentGroup.metadata.page_number;
                    const pages: number[] = Array.isArray(currentPage)
                        ? (currentPage as number[])
                        : (currentPage !== undefined ? [currentPage as number] : []);

                    const newPage = el.metadata.page_number;
                    if (Array.isArray(newPage)) {
                        for (const p of newPage) {
                            if (!pages.includes(p)) pages.push(p);
                        }
                    } else if (typeof newPage === 'number' && !pages.includes(newPage)) {
                        pages.push(newPage);
                    }

                    currentGroup.metadata.page_number = pages.length > 1 ? pages : pages[0];
                }
            } else {
                // If we had 10 list items and next is also list → new section then new group
                if (mergable && currentGroup && isListType(currentGroup.type) && groupCount >= 10) {
                    groupedElements.push(currentGroup);
                    groupedElements.push({
                        type: 'Title',
                        text: 'List (continued)',
                        element_id: this.generateId(),
                        metadata: {}
                    });
                    currentGroup = { ...el };
                    currentGroup.text = '- ' + (currentGroup.text || '');
                    groupedElements.push(currentGroup);
                    groupCount = 1;
                    continue;
                }
                // Start new group or add non-mergable element
                currentGroup = { ...el };
                if (isListType(type)) {
                    currentGroup.text = '- ' + (currentGroup.text || '');
                }
                groupedElements.push(currentGroup);
                groupCount = mergable ? 1 : 0;
            }
        }

        // 3. Create sections: by Title if any exist, else by NarrativeText
        const hasTitle = groupedElements.some(el => el.type.toLowerCase() === 'title');
        const sectionBoundaryType = hasTitle ? 'title' : 'narrativetext';

        const sections: Section[] = [];
        let currentSection: Section | null = null;

        for (const el of groupedElements) {
            const type = el.type.toLowerCase();
            const isBoundary = type === sectionBoundaryType;

            if (isBoundary) {
                const sectionTitle = type === 'title'
                    ? el.text
                    : (el.text.length > 80 ? el.text.slice(0, 80).trim() + '…' : el.text);
                currentSection = {
                    section_id: this.generateId(),
                    title: sectionTitle,
                    content: '',
                    elements: []
                };
                sections.push(currentSection);
            }

            // Add content to section (for Title we only set title above; for NarrativeText boundary we add content too)
            if (!currentSection) {
                currentSection = {
                    section_id: this.generateId(),
                    title: 'Introduction',
                    content: '',
                    elements: []
                };
                sections.push(currentSection);
            }

            if (isBoundary && type === 'title') {
                // Title-only: no content body
            } else {
                if (currentSection.content) {
                    currentSection.content += '\n\n';
                }
                currentSection.content += el.text;
                el.parent_id = currentSection.section_id;
                currentSection.elements.push(el);
            }
        }

        return sections.map(s => ({
            ...s,
            content: s.content.trim()
        }));
    }
}

/**
 * Separate step: enrich sections with LLM-generated searchable summary for tables
 * and description for images.
 */
export async function enrichSectionsWithAI(sections: Section[]): Promise<Section[]> {
    for (const section of sections) {
        for (const el of section.elements) {
            const type = el.type.toLowerCase();
            try {
                if (type === 'table') {
                    const content = el.metadata.text_as_html || el.text || '';
                    if (content.trim()) {
                        el.metadata.searchable_summary = await generateTableSummary(content);
                    }
                } else if (type === 'image' && el.metadata.image_base64) {
                    el.metadata.description = await generateImageDescription(el.metadata.image_base64);
                }
            } catch (err) {
                console.warn(`AI enrichment failed for element ${el.element_id} (${type}):`, err);
            }
        }
    }
    return sections;
}
