import { Project, ProjectMetadata } from '../types';
import { DEMO_PROJECT } from '../constants';

const STORAGE_KEY_PREFIX = 'nebula_project_';
const METADATA_KEY = 'nebula_projects_meta';

export const storageService = {
  // Get list of all projects
  getProjects: (): ProjectMetadata[] => {
    try {
      const raw = localStorage.getItem(METADATA_KEY);
      if (!raw) {
        // Initialize with Demo if empty
        // BREAKING RECURSION: We manually write to storage instead of calling saveProject
        const demoProject = {
            ...DEMO_PROJECT,
            lastEdited: Date.now()
        };
        
        // 1. Save Project Body
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${demoProject.id}`, JSON.stringify(demoProject));
        
        // 2. Save Metadata
        const meta: ProjectMetadata[] = [{ 
            id: demoProject.id, 
            name: demoProject.name, 
            lastEdited: demoProject.lastEdited,
            blockCount: demoProject.blocks.length 
        }];
        localStorage.setItem(METADATA_KEY, JSON.stringify(meta));
        
        return meta;
      }
      return JSON.parse(raw).sort((a: ProjectMetadata, b: ProjectMetadata) => b.lastEdited - a.lastEdited);
    } catch (e) {
      console.error('Failed to load project list', e);
      return [];
    }
  },

  // Load a full project
  loadProject: (id: string): Project | null => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to load project ${id}`, e);
      return null;
    }
  },

  // Save a project
  saveProject: (project: Project) => {
    try {
      // 1. Save full project data
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${project.id}`, JSON.stringify(project));

      // 2. Update metadata list
      // We get the raw string first to avoid triggering the initialization logic in getProjects 
      // if it was somehow cleared, though getProjects() handles that safely now.
      const rawMeta = localStorage.getItem(METADATA_KEY);
      let projects: ProjectMetadata[] = [];
      
      if (rawMeta) {
          try {
            projects = JSON.parse(rawMeta);
          } catch(e) {
            projects = [];
          }
      }

      const index = projects.findIndex(p => p.id === project.id);
      const meta: ProjectMetadata = {
        id: project.id,
        name: project.name,
        lastEdited: project.lastEdited,
        blockCount: project.blocks.length
      };

      if (index >= 0) {
        projects[index] = meta;
      } else {
        projects.push(meta);
      }
      
      localStorage.setItem(METADATA_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Failed to save project', e);
    }
  },

  // Delete
  deleteProject: (id: string) => {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`);
      const projects = storageService.getProjects().filter(p => p.id !== id);
      localStorage.setItem(METADATA_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Failed to delete project', e);
    }
  },

  // Create New
  createProject: (): Project => {
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: 'Untitled Project',
      blocks: [],
      connections: [],
      lastEdited: Date.now()
    };
    storageService.saveProject(newProject);
    return newProject;
  }
};